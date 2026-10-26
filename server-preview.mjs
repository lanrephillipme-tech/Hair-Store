import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {handleApi} from './server/api.mjs';
import {localDatabase} from './server/local-db.mjs';
const root=fileURLToPath(new URL('./public/',import.meta.url));
const dataDirectory=new URL('./.local-data/',import.meta.url);fs.mkdirSync(dataDirectory,{recursive:true});
const env={DB:localDatabase(fileURLToPath(new URL('store.sqlite',dataDirectory))),LOCAL_DEMO:true};
// No provider keys: the loopback preview uses explicit demo customer/admin identities.
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.webp':'image/webp'};
const port=Number(process.env.PORT||4173);
http.createServer(async(req,res)=>{
 try{
  if(![`localhost:${port}`,`127.0.0.1:${port}`].includes(req.headers.host)){res.writeHead(403);res.end('Local preview only');return;}
  const requestUrl=new URL(req.url,`http://${req.headers.host}`);
  if(requestUrl.pathname.startsWith('/api/')){
   const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>100000){res.writeHead(413);res.end('Request too large');return;}chunks.push(chunk);}
   const body=chunks.length?Buffer.concat(chunks):undefined;
   const response=await handleApi(new Request(requestUrl,{method:req.method,headers:req.headers,...(body?{body}:{} )}),env);
   res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text());return;
  }
  const pathname=decodeURIComponent(requestUrl.pathname);
  if(pathname==='/'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});fs.createReadStream(new URL('./storefront/index.html',import.meta.url)).pipe(res);return;}
  const file=path.resolve(root,'.'+pathname),relative=path.relative(root,file);
  if(relative.startsWith('..')||path.isAbsolute(relative)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end('Not found');return;}
  res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','X-Content-Type-Options':'nosniff','Cache-Control':'no-cache'});fs.createReadStream(file).pipe(res);
 }catch{res.writeHead(400);res.end('Bad request');}
}).listen(port,'127.0.0.1',()=>console.log(`Hair Beauty Sore local demo: http://localhost:${port}`));
