import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {handleApi} from './server/api.mjs';
const root=fileURLToPath(new URL('./public/',import.meta.url));
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.webp':'image/webp'};
const port=Number(process.env.PORT||4173);
http.createServer(async(req,res)=>{try{const requestUrl=new URL(req.url,`http://localhost:${port}`);if(requestUrl.pathname.startsWith('/api/')){const response=await handleApi(new Request(requestUrl,{method:req.method,headers:req.headers}),{});res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text());return;}const pathname=decodeURIComponent(requestUrl.pathname);if(pathname==='/'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});fs.createReadStream(new URL('./storefront/index.html',import.meta.url)).pipe(res);return;}const file=path.resolve(root,'.'+pathname);if(!file.startsWith(root)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end('Not found');return;}res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','X-Content-Type-Options':'nosniff','Cache-Control':'no-cache'});fs.createReadStream(file).pipe(res);}catch{res.writeHead(400);res.end('Bad request');}}).listen(port,'127.0.0.1',()=>console.log(`Hair Beauty Sore static preview: http://localhost:${port}`));
