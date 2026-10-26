import {findProduct,findService} from '../public/catalog.js';
import {normalizeCart,unitPrice,totals,validAppointment} from '../public/commerce.js';
import {countries} from '../public/countries.js';
import {handleWorkspace} from './workspace.mjs';

const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const error=(message,status=400)=>json({error:message},status);
const digest=async text=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),b=>b.toString(16).padStart(2,'0')).join('');
const testReady=env=>/^sk_test_/.test(env.STRIPE_SECRET_KEY||'')&&!!env.DB;
let rateCache;
export function validateCheckout(body){
  if(!body||!Array.isArray(body.cart)||body.cart.length<1||body.cart.length>30)throw new Error('Choose between 1 and 30 items.');
  for(const item of body.cart){
    if(!item||!['product','service'].includes(item.type)||!Number.isInteger(item.qty)||item.qty<1||item.qty>10)throw new Error('Invalid bag quantity.');
    if(item.type==='product'){const p=findProduct(item.id);if(!p||!p.options.includes(item.option))throw new Error('This product option is not available.');}
    else if(!findService(item.id)||item.qty!==1||!validAppointment(item.date)||!['10:00','12:00','14:00','16:00'].includes(item.time)||!['Studio visit','Virtual consultation'].includes(item.location)||(item.location==='Virtual consultation'&&item.id!=='consult'))throw new Error('Choose a valid future service appointment.');
  }
  const cart=normalizeCart(body.cart);if(cart.length!==body.cart.length)throw new Error('Combine duplicate bag items before checkout.');
  if(!['standard','express','pickup'].includes(body.delivery))throw new Error('Choose a delivery option.');
  if(!countries.some(([code])=>code===body.country))throw new Error('Choose a valid destination country.');
  if(body.delivery==='pickup'&&body.country!=='GB')throw new Error('Studio collection is available in the UK only.');
  const coupon=String(body.coupon||'').toUpperCase();if(coupon&&coupon!=='BEAUTY10')throw new Error('Invalid promotion code.');
  if(typeof body.email!=='string'||body.email.length>254||!/^\S+@\S+\.\S+$/.test(body.email))throw new Error('Enter a valid email address.');
  if(!/^[a-f0-9-]{36}$/.test(body.attempt||'')||!/^[a-f0-9-]{36}$/.test(body.token||''))throw new Error('Refresh checkout and try again.');
  const amounts=totals(cart,body.delivery,coupon,body.country);
  return {cart,delivery:body.delivery,country:body.country,coupon,email:body.email,attempt:body.attempt,token:body.token,amounts};
}
async function stripe(env,path,params,requestKey){
  const response=await fetch(`https://api.stripe.com/v1/${path}`,{method:params?'POST':'GET',headers:{Authorization:`Bearer ${env.STRIPE_SECRET_KEY}`,...(params?{'Content-Type':'application/x-www-form-urlencoded'}:{}),...(requestKey?{'Idempotency-Key':requestKey}:{})},body:params?.toString(),signal:AbortSignal.timeout(15000)});
  const data=await response.json();if(!response.ok)throw new Error('Stripe could not open the test checkout. Check the test account configuration and try again.');return data;
}
export function stripeParameters(order,origin){
  const p=new URLSearchParams({mode:'payment',success_url:`${origin}/#/payment-return?order=${order.id}`,cancel_url:`${origin}/#/checkout?cancelled=1`,customer_email:order.email,client_reference_id:order.id,'metadata[order_id]':order.id,'metadata[mode]':'test','adaptive_pricing[enabled]':'true','phone_number_collection[enabled]':'true'});
  let index=0;
  for(const item of order.cart){const product=item.type==='product'?findProduct(item.id):findService(item.id);const discount=order.coupon==='BEAUTY10'&&item.type==='product';const amount=unitPrice(item)-(discount?Math.round(unitPrice(item)*.1):0);const name=product.name+(item.type==='product'?` · ${item.option}`:` · ${item.date} ${item.time} Europe/London · ${item.location}`);p.set(`line_items[${index}][price_data][currency]`,'gbp');p.set(`line_items[${index}][price_data][unit_amount]`,String(amount));p.set(`line_items[${index}][price_data][product_data][name]`,name);p.set(`line_items[${index}][quantity]`,String(item.qty));index++;}
  if(order.amounts.shipping){p.set(`line_items[${index}][price_data][currency]`,'gbp');p.set(`line_items[${index}][price_data][unit_amount]`,String(order.amounts.shipping));p.set(`line_items[${index}][price_data][product_data][name]`,`${order.delivery==='express'?'Express':'Standard'} delivery to ${order.country} (test rate)`);p.set(`line_items[${index}][quantity]`,'1');}
  if(order.amounts.hasProducts&&order.delivery!=='pickup')p.set('shipping_address_collection[allowed_countries][0]',order.country);
  p.set('custom_text[submit][message]','Test order only. No real products will ship and service appointments remain unconfirmed.');
  return p;
}
export async function verifyWebhook(raw,signature,secret,now=Date.now()){
  if(!signature||!secret)return false;
  const parts=signature.split(',').map(s=>s.split('='));const timestamp=parts.find(([k])=>k==='t')?.[1];const signatures=parts.filter(([k])=>k==='v1').map(([,v])=>v);
  if(!/^\d+$/.test(timestamp||'')||Math.abs(now/1000-Number(timestamp))>300)return false;
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);
  for(const sig of signatures){if(!/^[a-f0-9]{64}$/.test(sig||''))continue;const bytes=Uint8Array.from(sig.match(/../g),b=>parseInt(b,16));if(await crypto.subtle.verify('HMAC',key,bytes,new TextEncoder().encode(`${timestamp}.${raw}`)))return true;}return false;
}
export function verifiedPayment(session,order){return session.livemode===false&&session.id===order.session_id&&session.client_reference_id===order.id&&session.currency==='gbp'&&session.amount_total===order.total&&session.payment_status==='paid';}
async function webhook(request,env){
  if(!env.DB||!env.STRIPE_WEBHOOK_SECRET)return error('Webhook is not configured.',503);
  const raw=await request.text();if(raw.length>100000)return error('Payload too large.',413);
  if(!await verifyWebhook(raw,request.headers.get('stripe-signature'),env.STRIPE_WEBHOOK_SECRET))return error('Invalid webhook signature.',400);
  const event=JSON.parse(raw);if(event.livemode!==false)return error('Only test events are accepted.',400);
  if(!['checkout.session.completed','checkout.session.async_payment_succeeded','checkout.session.async_payment_failed','checkout.session.expired'].includes(event.type))return json({received:true});
  const session=event.data?.object;const order=await env.DB.prepare('SELECT * FROM test_orders WHERE session_id = ?').bind(session?.id||'').first();
  if(!order)return error('Order not ready. Retry this event.',409);
  const paid=verifiedPayment(session,order);const status=paid?'test_paid':event.type.endsWith('expired')?'expired':event.type.endsWith('async_payment_failed')?'failed':'pending';
  await env.DB.batch([env.DB.prepare('INSERT OR IGNORE INTO payment_events (id, order_id, created_at) VALUES (?, ?, ?)').bind(event.id,order.id,new Date().toISOString()),env.DB.prepare("UPDATE test_orders SET status = ? WHERE id = ? AND status != 'test_paid'").bind(status,order.id)]);
  return json({received:true});
}
export async function handleApi(request,env){
  const workspace=await handleWorkspace(request,env);if(workspace)return workspace;
  const url=new URL(request.url);const path=url.pathname;
  try{
    if(request.method==='GET'&&path==='/api/config')return json({stripeReady:testReady(env),mode:'test',baseCurrency:'GBP',webhookReady:!!env.STRIPE_WEBHOOK_SECRET});
    if(request.method==='GET'&&path==='/api/rates'){
      if(rateCache&&Date.now()-rateCache.saved<3600000)return json(rateCache.data);
      try{const r=await fetch('https://open.er-api.com/v6/latest/GBP',{signal:AbortSignal.timeout(6000)});if(!r.ok)throw new Error();const rates=await r.json();if(rates.result!=='success'||!rates.rates)throw new Error();const data={rates:rates.rates,updated:rates.time_last_update_utc,source:'https://www.exchangerate-api.com'};rateCache={data,saved:Date.now()};return json(data);}catch{return json({rates:{GBP:1},updated:null});}
    }
    if(request.method==='POST'&&path==='/api/stripe/webhook')return await webhook(request,env);
    if(path==='/api/checkout'&&request.method==='POST'){
      if(!testReady(env))return error('Stripe test payments are not configured. Add STRIPE_SECRET_KEY with an sk_test_ key to continue. No payment was made.',503);
      if(request.headers.get('origin')!==url.origin)return error('This request must come from the storefront.',403);
      if(!request.headers.get('content-type')?.includes('application/json'))return error('Expected a JSON checkout request.',415);
      const raw=await request.text();if(raw.length>24000)return error('Checkout request is too large.',413);
      let order;try{order=validateCheckout(JSON.parse(raw));}catch(e){return error(e.message);}
      const tokenHash=await digest(order.token);const checkoutKey=await digest(JSON.stringify({cart:order.cart,delivery:order.delivery,country:order.country,coupon:order.coupon,total:order.amounts.total,email:order.email,attempt:order.attempt,tokenHash}));order.id=`HBS-${checkoutKey.slice(0,24)}`;
      await env.DB.prepare('INSERT OR IGNORE INTO test_orders (id, token_hash, checkout_key, cart, total, currency, delivery, country, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(order.id,tokenHash,checkoutKey,JSON.stringify(order.cart),order.amounts.total,'gbp',order.delivery,order.country,'pending',new Date().toISOString()).run();
      const params=stripeParameters(order,url.origin);const session=await stripe(env,'checkout/sessions',params,checkoutKey);
      if(session.livemode!==false||!session.id?.startsWith('cs_test_')||!session.url?.startsWith('https://checkout.stripe.com/'))return error('An invalid Stripe test session was returned.',502);
      await env.DB.prepare('UPDATE test_orders SET session_id = ? WHERE id = ?').bind(session.id,order.id).run();
      return json({url:session.url,orderId:order.id});
    }
    if(path.startsWith('/api/orders/')&&request.method==='GET'){
      if(!testReady(env))return error('Stripe is not configured.',503);
      const id=path.split('/').pop();if(!/^HBS-[a-f0-9]{24}$/.test(id))return error('Order not found.',404);
      const bearer=request.headers.get('authorization')||'';const hash=await digest(bearer.replace(/^Bearer /,''));const order=await env.DB.prepare('SELECT * FROM test_orders WHERE id = ? AND token_hash = ?').bind(id,hash).first();if(!order)return error('Order not found in this checkout session.',404);
      if(order.session_id&&order.status!=='test_paid'){const session=await stripe(env,`checkout/sessions/${encodeURIComponent(order.session_id)}`);if(verifiedPayment(session,order)){await env.DB.prepare('UPDATE test_orders SET status = ? WHERE id = ?').bind('test_paid',order.id).run();order.status='test_paid';}}
      return json({id:order.id,status:order.status,total:order.total,currency:order.currency,items:JSON.parse(order.cart),delivery:order.delivery,country:order.country});
    }
    return error('Not found.',404);
  }catch{return error('This request could not be completed. Please try again. No payment success has been recorded by this page.',502);}
}
