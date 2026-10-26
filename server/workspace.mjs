import {products} from '../public/catalog.js';
import {validAppointment} from '../public/commerce.js';

const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
const text=(v,max=500)=>{if(typeof v!=='string'||!v.trim()||v.length>max)fail('Please complete the required fields.');return v.trim();};
const rows=async(db,sql,...args)=>(await db.prepare(sql).bind(...args).all()).results;
const run=(db,sql,...args)=>db.prepare(sql).bind(...args).run();
const now=()=>new Date().toISOString();
export function identity(request,env){
  // Local demo identities are enabled only by the loopback Node preview, never by request input on Workers.
  if(env.LOCAL_DEMO===true){const admin=/(?:^|; )hbs-demo-role=admin(?:;|$)/.test(request.headers.get('cookie')||'');return {id:admin?'demo-admin':'demo-customer',email:admin?'owner@example.com':'customer@example.com',admin};}
  const id=request.headers.get('oai-authenticated-user-id');
  return id?{id,email:request.headers.get('oai-authenticated-user-email')||'',admin:String(env.ADMIN_USER_IDS||'').split(',').map(s=>s.trim()).filter(Boolean).includes(id)}:null;
}
export function validMeeting(value){if(!value)return '';try{const u=new URL(value);if(u.protocol==='https:'&&!u.username&&!u.password)return u.href;}catch{}fail('Enter a secure https meeting link.');}
const eventStatement=(db,user,kind,detail)=>db.prepare('INSERT INTO store_activity (id,user_id,kind,detail,created_at) VALUES (?,?,?,?,?)').bind(crypto.randomUUID(),user.id,kind,detail,now());
export async function handleWorkspace(request,env){
 const url=new URL(request.url),path=url.pathname.replace('/api/workspace','')||'/';
 if(!url.pathname.startsWith('/api/workspace'))return null;
 try{
  const user=identity(request,env);
  if(request.method==='GET'&&path==='/session')return json({user,localDemo:env.LOCAL_DEMO===true,authMode:env.RENDER_AUTH?'render':'sites',aiReady:!!env.OPENAI_API_KEY&&!!env.OPENAI_MODEL,databaseReady:!!env.DB});
  if(!user)fail('Sign in to your account to continue.',401);
  if(!env.DB)fail('The account database is not connected yet.',503);
  const db=env.DB;
  let body={};
  if(request.method==='POST'){
    if(request.headers.get('origin')!==url.origin)fail('This request must come from the store.',403);
    if(!request.headers.get('content-type')?.includes('application/json'))fail('Expected JSON.',415);
    const raw=await request.text();if(raw.length>12000)fail('Request too large.',413);
    try{body=JSON.parse(raw);}catch{fail('Invalid request.');}
    if(!body||typeof body!=='object'||Array.isArray(body))fail('Invalid request.');
  }
  if(request.method==='POST'&&path==='/demo-role'&&env.LOCAL_DEMO===true){if(!['admin','customer'].includes(body.role))fail('Invalid role.');const r=json({ok:true});r.headers.set('Set-Cookie',`hbs-demo-role=${body.role}; Path=/; HttpOnly; SameSite=Strict`);return r;}
  if(path.startsWith('/admin')&&!user.admin)fail('Administrator access is required. The owner must configure ADMIN_USER_IDS.',403);
  if(request.method==='GET'&&path==='/profile'){
    const profile=await db.prepare('SELECT * FROM customer_profiles WHERE user_id=?').bind(user.id).first();
    return json({profile,bookings:await rows(db,'SELECT * FROM virtual_bookings WHERE user_id=? ORDER BY created_at DESC LIMIT 100',user.id)});
  }
  if(request.method==='POST'&&path==='/profile'){
    const name=text(body.name,100),phone=String(body.phone||'').slice(0,40);
    await db.batch([db.prepare('INSERT INTO customer_profiles (user_id,name,email,phone,created_at) VALUES (?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET name=excluded.name,phone=excluded.phone,email=excluded.email').bind(user.id,name,user.email,phone,now()),eventStatement(db,user,'account','Customer profile saved')]);return json({ok:true});
  }
  if(request.method==='GET'&&path==='/chat')return json({messages:await rows(db,'SELECT * FROM support_messages WHERE user_id=? ORDER BY created_at DESC LIMIT 100',user.id)});
  if(request.method==='POST'&&path==='/chat'){
    const message=text(body.message,2000);
    const recent=await db.prepare("SELECT count(*) AS n FROM support_messages WHERE user_id=? AND created_at>? AND role='customer'").bind(user.id,new Date(Date.now()-60000).toISOString()).first();if(recent.n>=8)fail('Please wait a minute before sending more messages.',429);
    if(body.mode==='ai'&&(!env.OPENAI_API_KEY||!env.OPENAI_MODEL))fail('AI support is not connected yet. Choose the support team to leave a message.',503);
    if(body.mode==='ai'&&body.consent!==true)fail('Please consent to sending this message to the AI provider.');
    await db.batch([db.prepare('INSERT INTO support_messages (id,user_id,role,body,created_at) VALUES (?,?,?,?,?)').bind(crypto.randomUUID(),user.id,'customer',message,now()),eventStatement(db,user,'support',body.mode==='ai'?'AI support message':'Message for support team')]);
    if(body.mode==='ai'){
      const history=await rows(db,"SELECT role,body FROM support_messages WHERE user_id=? AND role IN ('customer','assistant') ORDER BY created_at DESC LIMIT 10",user.id);
      let answer;try{
        const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model:env.OPENAI_MODEL,store:false,max_output_tokens:600,instructions:`You are Hair Beauty Store support. UK based sample hair store. All products/prices are sample, checkout is Stripe test only. Delivery UK standard GBP8/free above GBP250 after discount; express GBP18. International standard GBP18, express GBP35. Help with hair selection and care. Never claim a payment, booking confirmation, stock level or refund. You cannot take actions. Direct personal order questions to the support team. Virtual 30 minute consultation requests are made using the chat booking form and require staff confirmation and a meeting link. Avoid medical advice. Catalogue (GBP pence): ${JSON.stringify(products.map(p=>({name:p.name,category:p.category,price:p.price})))}`,input:history.reverse().map(m=>({role:m.role==='customer'?'user':'assistant',content:m.body}))}),signal:AbortSignal.timeout(25000)});
        if(!response.ok)throw new Error();const data=await response.json();answer=data.output?.flatMap(o=>o.content||[]).filter(c=>c.type==='output_text').map(c=>c.text).join('\n');if(!answer)throw new Error();
      }catch{fail('Your message was saved, but AI could not reply. You can contact the support team.',502);}
      await run(db,'INSERT INTO support_messages (id,user_id,role,body,created_at) VALUES (?,?,?,?,?)',crypto.randomUUID(),user.id,'assistant',answer.slice(0,6000),now());
    }
    return json({ok:true});
  }
  if(request.method==='POST'&&path==='/bookings'){
    const date=text(body.date,10),time=text(body.time,5),notes=text(body.notes,1000);
    if(!validAppointment(date)||!['10:00','12:00','14:00','16:00'].includes(time))fail('Choose a date tomorrow through the next 90 days and an available time.');
    const active=await db.prepare("SELECT count(*) AS n FROM virtual_bookings WHERE user_id=? AND status IN ('requested','confirmed')").bind(user.id).first();if(active.n>=3)fail('You already have three open requests. Please contact the support team.');
    const id=crypto.randomUUID(),stamp=now();
    await db.batch([db.prepare("INSERT INTO virtual_bookings (id,user_id,date,time,notes,status,meeting_url,created_at) VALUES (?,?,?,?,?,'requested','',?)").bind(id,user.id,date,time,notes,stamp),db.prepare('INSERT INTO support_messages (id,user_id,role,body,created_at) VALUES (?,?,?,?,?)').bind(crypto.randomUUID(),user.id,'system',`Virtual consultation requested: ${date} at ${time} Europe/London. Awaiting staff confirmation.`,stamp),eventStatement(db,user,'booking',`Virtual session requested: ${date} ${time}`)]);return json({ok:true,id});
  }
  if(request.method==='POST'&&path==='/activity'){
    if(!['page_view','cart_update','preview_order'].includes(body.kind))fail('Invalid activity type.');
    const detail=text(body.detail,160);await eventStatement(db,user,body.kind,detail).run();return json({ok:true});
  }
  if(request.method==='GET'&&path==='/admin'){
    const [customers,bookings,messages,activity,orders,fulfilment]=await Promise.all([
      rows(db,'SELECT * FROM customer_profiles ORDER BY created_at DESC LIMIT 200'),rows(db,'SELECT * FROM virtual_bookings ORDER BY created_at DESC LIMIT 200'),rows(db,'SELECT * FROM support_messages ORDER BY created_at DESC LIMIT 300'),rows(db,'SELECT * FROM store_activity ORDER BY created_at DESC LIMIT 200'),rows(db,'SELECT id,total,currency,delivery,country,status,created_at,cart FROM test_orders ORDER BY created_at DESC LIMIT 200'),rows(db,'SELECT * FROM order_fulfilment')]);
    return json({customers,bookings,messages,activity,orders,fulfilment});
  }
  if(request.method==='POST'&&path==='/admin/reply'){
    const target=text(body.userId,200),message=text(body.message,2000);
    const exists=await db.prepare('SELECT id FROM support_messages WHERE user_id=? LIMIT 1').bind(target).first();if(!exists)fail('Conversation not found.',404);
    await db.batch([db.prepare('INSERT INTO support_messages (id,user_id,role,body,created_at) VALUES (?,?,?,?,?)').bind(crypto.randomUUID(),target,'staff',message,now()),eventStatement(db,user,'admin','Replied to support conversation')]);return json({ok:true});
  }
  if(request.method==='POST'&&path==='/admin/booking'){
    const id=text(body.id,100),status=text(body.status,30),meeting=validMeeting(body.meetingUrl);
    if(!['confirmed','completed','cancelled'].includes(status))fail('Invalid booking status.');
    if(status==='confirmed'&&!meeting)fail('Add a meeting link before confirming.');
    const booking=await db.prepare('SELECT * FROM virtual_bookings WHERE id=?').bind(id).first();if(!booking)fail('Booking not found.',404);
    if(status==='confirmed'){
      if(!validAppointment(booking.date))fail('This date has passed or is no longer bookable.');
      const clash=await db.prepare("SELECT id FROM virtual_bookings WHERE date=? AND time=? AND status='confirmed' AND id!=?").bind(booking.date,booking.time,id).first();if(clash)fail('Another session is already confirmed at this time.',409);
    }
    await db.batch([db.prepare('UPDATE virtual_bookings SET status=?,meeting_url=? WHERE id=?').bind(status,meeting,id),db.prepare('INSERT INTO support_messages (id,user_id,role,body,created_at) VALUES (?,?,?,?,?)').bind(crypto.randomUUID(),booking.user_id,'system',`Your virtual session on ${booking.date} at ${booking.time} Europe/London is ${status}. See My account for meeting details.`,now()),eventStatement(db,user,'admin',`Booking ${status}`)]);return json({ok:true});
  }
  if(request.method==='POST'&&path==='/admin/fulfilment'){
    const id=text(body.id,100),status=text(body.status,30),tracking=String(body.tracking||'').slice(0,200);
    if(!['unfulfilled','processing','dispatched','delivered','cancelled'].includes(status))fail('Invalid fulfilment status.');
    const order=await db.prepare('SELECT id,status FROM test_orders WHERE id=?').bind(id).first();if(!order)fail('Order not found.',404);
    if(['processing','dispatched','delivered'].includes(status)&&order.status!=='test_paid')fail('Verify the test payment before updating fulfilment.');
    await db.batch([db.prepare('INSERT INTO order_fulfilment (order_id,status,tracking,updated_at) VALUES (?,?,?,?) ON CONFLICT(order_id) DO UPDATE SET status=excluded.status,tracking=excluded.tracking,updated_at=excluded.updated_at').bind(id,status,tracking,now()),eventStatement(db,user,'admin',`Test order fulfilment: ${status}`)]);return json({ok:true});
  }
  return json({error:'Not found.'},404);
 }catch(e){return json({error:e.status?e.message:'The request could not be completed. Please try again.'},e.status||500);}
}
