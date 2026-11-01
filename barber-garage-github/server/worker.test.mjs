import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import worker, { validateCatalog, validateHours } from './worker.mjs';

const origin = 'https://barber-test.pages.dev';
const issuer = 'https://barber-test.cloudflareaccess.com';
const pair = await crypto.subtle.generateKey({ name:'RSASSA-PKCS1-v1_5', modulusLength:2048, publicExponent:new Uint8Array([1,0,1]), hash:'SHA-256' }, true, ['sign','verify']);
const jwk = { ...await crypto.subtle.exportKey('jwk', pair.publicKey), kid:'test-key' };
globalThis.fetch = async url => {
  assert.equal(String(url), issuer + '/cdn-cgi/access/certs');
  return Response.json({ keys:[jwk] });
};
async function token(extra = {}) {
  const now = Math.floor(Date.now()/1000);
  const head = Buffer.from(JSON.stringify({alg:'RS256',kid:'test-key'})).toString('base64url');
  const body = Buffer.from(JSON.stringify({iss:issuer,aud:['barber-aud'],sub:'owner-id',email:'barbergaragemilano@gmail.com',iat:now,exp:now+600,...extra})).toString('base64url');
  const input = head+'.'+body;
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5',pair.privateKey,new TextEncoder().encode(input));
  return input+'.'+Buffer.from(signature).toString('base64url');
}
const validToken = await token();
function environment() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('./schema.sql',import.meta.url),'utf8'));
  sqlite.exec(readFileSync(new URL('./seed.sql',import.meta.url),'utf8'));
  const images = new Map();
  return {
    ACCESS_ISSUER:issuer,ACCESS_AUD:'barber-aud',ADMIN_EMAILS:'barbergaragemilano@gmail.com',
    sqlite,
    DB: {prepare(sql) { const statement = sqlite.prepare(sql); let args=[]; return {
      bind(...values) {args=values;return this;},
      async first() {return statement.get(...args) || null;},
      async run() {return {meta:{changes:Number(statement.run(...args).changes)}};}
    };}},
    PHOTOS: { async put(name,body) {images.set(name,body);}, async head(name) {return images.has(name) ? {} : null;}, async get(name) {return images.has(name) ? {body:images.get(name),httpEtag:'test'} : null;} },
    ASSETS:{fetch: async () => new Response('asset')}
  };
}
function req(path, options={}) {
  const { auth=true, jwt=validToken, cross=false, body, method='GET', ...rest } = options;
  const headers = new Headers(rest.headers);
  if (auth) headers.set('Cf-Access-Jwt-Assertion',jwt);
  if (method!=='GET') {headers.set('Origin',cross?'https://evil.example':origin);headers.set('X-Garage-Admin','1');}
  let payload=body;
  if (body && !(body instanceof Uint8Array)) {headers.set('Content-Type','application/json');payload=JSON.stringify(body);}
  return new Request(origin+path,{method,headers,body:payload});
}
test('public reads and security headers; admin fails closed',async()=>{
  const env=environment();
  let response=await worker.fetch(req('/api/catalog',{auth:false}),env);
  assert.equal(response.status,200);assert.equal((await response.json()).data.services.length,14);
  assert.match(response.headers.get('Content-Security-Policy'),/script-src 'self'/);
  for(const path of ['/admin/','/admin/index.html','/api/admin/session']) assert.equal((await worker.fetch(req(path,{auth:false}),env)).status,401);
  assert.equal((await worker.fetch(req('/admin/'),{...env,ACCESS_AUD:''})).status,503);
  assert.equal((await worker.fetch(req('/admin/'),env)).status,200);
});
test('expired, wrong audience, forged and unauthorized identities rejected',async()=>{
  const env=environment();
  for(const claims of [{exp:1},{aud:['other']},{iss:'https://evil.example'},{nbf:Date.now()/1000+500}]) {
    assert.equal((await worker.fetch(req('/api/admin/session',{jwt:await token(claims)}),env)).status,401);
  }
  assert.equal((await worker.fetch(req('/api/admin/session',{jwt:await token({email:'other@example.com'})}),env)).status,403);
  const parts=validToken.split('.');parts[1]=Buffer.from(JSON.stringify({email:'other'})).toString('base64url');
  assert.equal((await worker.fetch(req('/api/admin/session',{jwt:parts.join('.')}),env)).status,401);
});
test('save, optimistic concurrency, history and CSRF protection',async()=>{
  const env=environment();
  const state=await (await worker.fetch(req('/api/catalog'),env)).json();
  state.data.services[0].price=42.5;state.data.products=[];
  assert.equal((await worker.fetch(req('/api/admin/catalog',{method:'PUT',body:state,auth:false}),env)).status,401);
  assert.equal((await worker.fetch(req('/api/admin/catalog',{method:'PUT',body:state,cross:true}),env)).status,403);
  assert.equal((await worker.fetch(req('/api/catalog',{method:'PUT',body:state}),env)).status,405);
  const saved=await worker.fetch(req('/api/admin/catalog',{method:'PUT',body:state}),env);
  assert.equal(saved.status,200); assert.equal((await saved.json()).revision,2);
  assert.equal((await worker.fetch(req('/api/admin/catalog',{method:'PUT',body:state}),env)).status,409);
  const read=await (await worker.fetch(req('/api/catalog',{auth:false}),env)).json();
  assert.equal(read.data.services[0].price,42.5);assert.equal(read.data.products.length,0);
  assert.equal(env.sqlite.prepare('SELECT COUNT(*) AS n FROM document_history').get().n,1);
});
test('server validates catalogue and hours',()=>{
  const item={id:'test',name:'Test',description:'',section:'Capelli',price:10,photo:''};
  const catalog={version:1,services:[item],products:[]};
  assert.equal(validateCatalog(catalog).services[0].price,10);
  for(const price of [-1,Infinity,1.234]) assert.throws(()=>validateCatalog({...catalog,services:[{...item,price}]}));
  assert.throws(()=>validateCatalog({...catalog,products:[{...item,photo:'javascript:alert(1)'}]}));
  assert.throws(()=>validateCatalog({...catalog,services:[item,item]}));
  const week=Array.from({length:7},()=>({closed:false,slots:[{start:'09:00',end:'12:00'},{start:'14:00',end:'19:00'}]}));
  assert.equal(validateHours(week).length,7);
  week[0].slots[1].start='11:00';assert.throws(()=>validateHours(week));
});
test('image uploads require identity, JPEG type and bounded data',async()=>{
  const env=environment();
  const image=new Uint8Array([255,216,255,224,0,0,255,217]);
  const options={method:'POST',headers:{'Content-Type':'image/jpeg'},body:image};
  assert.equal((await worker.fetch(req('/api/admin/photos',{...options,auth:false}),env)).status,401);
  assert.equal((await worker.fetch(req('/api/admin/photos',{...options,body:new Uint8Array([1,2,3,4])}),env)).status,400);
  assert.equal((await worker.fetch(req('/api/admin/photos',{...options,body:new Uint8Array(2097153)}),env)).status,413);
  const upload=await worker.fetch(req('/api/admin/photos',options),env);assert.equal(upload.status,201);
  const {url}=await upload.json();assert.equal((await worker.fetch(req(url,{auth:false}),env)).status,200);
  const state=await (await worker.fetch(req('/api/catalog'),env)).json();state.data.products[0].photo=url;
  assert.equal((await worker.fetch(req('/api/admin/catalog',{method:'PUT',body:state}),env)).status,200);
});
