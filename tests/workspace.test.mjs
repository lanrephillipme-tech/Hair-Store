import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {localDatabase} from '../server/local-db.mjs';
import {handleApi} from '../server/api.mjs';

test('customer data stays private while staff can reply and confirm one virtual slot',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hbs-workspace-'));const db=localDatabase(path.join(dir,'store.sqlite'));
 const env={DB:db,LOCAL_DEMO:true};const origin='http://localhost:4173';
 const call=async(route,body,admin=false)=>{const request=new Request(origin+'/api/workspace'+route,{method:body?'POST':'GET',headers:{origin,'content-type':'application/json',cookie:`hbs-demo-role=${admin?'admin':'customer'}`},...body?{body:JSON.stringify(body)}:{}});const response=await handleApi(request,env);return {status:response.status,data:await response.json()};};
 try{
  assert.equal((await call('/admin',null)).status,403);
  assert.equal((await call('/profile',{name:'Demo Buyer',phone:''})).status,200);
  assert.equal((await call('/chat',{message:'Can I book a hair consultation?',mode:'team'})).status,200);
  const tomorrow=new Date();tomorrow.setDate(tomorrow.getDate()+3);const date=[tomorrow.getFullYear(),String(tomorrow.getMonth()+1).padStart(2,'0'),String(tomorrow.getDate()).padStart(2,'0')].join('-');
  const booked=await call('/bookings',{date,time:'10:00',notes:'Demo hair fit consultation'});assert.equal(booked.status,200);
  const view=await call('/admin',null,true);assert.equal(view.status,200);assert.equal(view.data.bookings[0].status,'requested');assert.equal(view.data.customers[0].name,'Demo Buyer');
  assert.equal((await call('/admin/booking',{id:booked.data.id,status:'confirmed',meetingUrl:''},true)).status,400);
  assert.equal((await call('/admin/booking',{id:booked.data.id,status:'confirmed',meetingUrl:'https://example.com/meeting/demo'},true)).status,200);
  assert.equal((await call('/admin/reply',{userId:'demo-customer',message:'Your demo session is confirmed.'},true)).status,200);
  const customer=await call('/profile',null);assert.equal(customer.data.bookings[0].status,'confirmed');assert.equal(customer.data.bookings[0].meeting_url,'https://example.com/meeting/demo');
  const messages=await call('/chat',null);assert.ok(messages.data.messages.some(m=>m.role==='staff'&&m.body.includes('confirmed')));
  assert.equal((await call('/admin/fulfilment',{id:'fake',status:'dispatched'},true)).status,404);
 }finally{db.close();fs.rmSync(dir,{recursive:true,force:true});}
});
