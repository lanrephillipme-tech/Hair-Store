import {findProduct,findService,store} from './catalog.js';
export {formatMoney as money} from './currency.js';
export function unitPrice(item) { const p=item.type==='service'?findService(item.id):findProduct(item.id); if(!p)return 0; return p.price+(item.type==='service'?0:(p.increments[p.options.indexOf(item.option)]||0)); }
export function normalizeCart(items) {
  if(!Array.isArray(items))return [];
  const result=[];
  for(const i of items.slice(0,50)) {
    if(!i||!['product','service'].includes(i.type))continue;
    if(i.type==='product') {const p=findProduct(i.id);if(!p||!p.options.includes(i.option))continue;const qty=Number.isFinite(i.qty)?Math.max(1,Math.min(10,Math.floor(i.qty))):1; const key=`${i.id}:${i.option}`;const existing=result.find(x=>x.key===key);if(existing)existing.qty=Math.min(10,existing.qty+qty);else result.push({key,id:i.id,type:'product',option:i.option,qty});}
    else {const s=findService(i.id);if(!s||!/^\d{4}-\d{2}-\d{2}$/.test(i.date||'')||!['10:00','12:00','14:00','16:00'].includes(i.time)||!['Studio visit','Virtual consultation'].includes(i.location))continue;const key=`${i.id}:${i.date}:${i.time}:${i.location}`;if(!result.some(x=>x.key===key))result.push({key,id:i.id,type:'service',qty:1,date:i.date,time:i.time,location:i.location});}
  }
  return result;
}
export function totals(cart,delivery='standard',coupon='',country='GB') {
  const clean=normalizeCart(cart);let products=0,services=0;
  clean.forEach(i=>{if(i.type==='service')services+=unitPrice(i);else products+=unitPrice(i)*i.qty;});
  const discount=coupon.toUpperCase()==='BEAUTY10'?Math.round(products*.1):0;
  const international=country!=='GB';
  const shipping=products===0||delivery==='pickup'?0:international?(delivery==='express'?3500:1800):delivery==='express'?1800:products-discount>=store.freeShippingAt?0:800;
  return {products,services,subtotal:products+services,discount,shipping,total:products+services-discount+shipping,hasProducts:products>0};
}
export function localDate(date=new Date()) {return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;}
export function validAppointment(date) {const today=new Date();today.setHours(0,0,0,0);const value=new Date(`${date}T12:00:00`);const max=new Date(today);max.setDate(max.getDate()+90);return /^\d{4}-\d{2}-\d{2}$/.test(date)&&!Number.isNaN(value.valueOf())&&localDate(value)===date&&value>today&&date!==localDate(today)&&value<=max;}
export function loadSaved(storage,key,fallback) {try{return JSON.parse(storage.getItem(key))??fallback;}catch{return fallback;}}
export function save(storage,key,value) {try{storage.setItem(key,JSON.stringify(value));return true;}catch{return false;}}
