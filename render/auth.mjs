import {randomBytes,randomUUID,scrypt as scryptCallback,createHash,timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
const scrypt=promisify(scryptCallback);
const json=(body,status=200,headers={})=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store',...headers}});
const hashToken=token=>createHash('sha256').update(token).digest('hex');
const cookieName='hbs_session';
const cookie=(value,maxAge)=>`${cookieName}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
const emailValid=email=>typeof email==='string'&&email.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const passwordValid=password=>typeof password==='string'&&password.length>=12&&password.length<=128;
export async function sessionUser(request,db){
 const token=request.headers.get('cookie')?.match(/(?:^|;\s*)hbs_session=([A-Za-z0-9_-]{32,})/)?.[1];if(!token)return null;
 const record=await db.prepare('SELECT auth_users.id,auth_users.email FROM auth_sessions JOIN auth_users ON auth_users.id=auth_sessions.user_id WHERE auth_sessions.token_hash=? AND auth_sessions.expires_at>?').bind(hashToken(token),new Date().toISOString()).first();return record||null;
}
async function newSession(db,id){const token=randomBytes(32).toString('base64url');await db.prepare('INSERT INTO auth_sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').bind(hashToken(token),id,new Date(Date.now()+30*86400000).toISOString()).run();return cookie(token,30*86400);}
export async function handleAuth(request,db){
 const url=new URL(request.url),path=url.pathname;if(!path.startsWith('/api/auth/'))return null;
 if(request.method!=='POST')return json({error:'Method not allowed.'},405);
 if(request.headers.get('origin')!==url.origin)return json({error:'This request must come from the store.'},403);
 if(path==='/api/auth/logout'){
  const token=request.headers.get('cookie')?.match(/(?:^|;\s*)hbs_session=([A-Za-z0-9_-]{32,})/)?.[1];if(token)await db.prepare('DELETE FROM auth_sessions WHERE token_hash=?').bind(hashToken(token)).run();return json({ok:true},200,{'Set-Cookie':cookie('',0)});
 }
 if(!['/api/auth/register','/api/auth/login'].includes(path))return json({error:'Not found.'},404);
 if(!request.headers.get('content-type')?.includes('application/json'))return json({error:'Expected JSON.'},415);
 const raw=await request.text();if(raw.length>4000)return json({error:'Request too large.'},413);
 let body;try{body=JSON.parse(raw);}catch{return json({error:'Invalid request.'},400);}
 const email=String(body?.email||'').trim().toLowerCase(),password=body?.password;
 if(!emailValid(email)||!passwordValid(password))return json({error:'Enter a valid email and a password of 12–128 characters.'},400);
 if(path.endsWith('/register')){
  const salt=randomBytes(16).toString('hex'),key=await scrypt(password,salt,64),id=randomUUID();
  try{await db.prepare('INSERT INTO auth_users(id,email,password_hash,created_at) VALUES(?,?,?,?)').bind(id,email,`${salt}:${key.toString('hex')}`,new Date().toISOString()).run();}
  catch(error){if(error.code==='23505')return json({error:'An account already exists for this email.'},409);throw error;}
  return json({ok:true},201,{'Set-Cookie':await newSession(db,id)});
 }
 const user=await db.prepare('SELECT id,password_hash FROM auth_users WHERE email=?').bind(email).first();
 if(!user)return json({error:'Email or password is incorrect.'},401);
 const [salt,stored]=user.password_hash.split(':');const actual=await scrypt(password,salt,64);if(!stored||!timingSafeEqual(actual,Buffer.from(stored,'hex')))return json({error:'Email or password is incorrect.'},401);
 return json({ok:true},200,{'Set-Cookie':await newSession(db,user.id)});
}
