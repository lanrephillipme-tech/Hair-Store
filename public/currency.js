export const displayCurrency={code:'GBP',rates:{GBP:1},updated:null};
export const baseMoney=cents=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP',maximumFractionDigits:2,minimumFractionDigits:cents%100?2:0}).format(cents/100);
export function setCurrency(code){displayCurrency.code=displayCurrency.rates[code]?code:'GBP';}
export function formatMoney(cents){const c=displayCurrency.code;const amount=cents/100*(displayCurrency.rates[c]||1);return new Intl.NumberFormat('en-GB',{style:'currency',currency:c,maximumFractionDigits:2,minimumFractionDigits:Number.isInteger(amount)?0:2}).format(amount);}
export async function loadRates(){try{const cached=await fetch('/rates-cache.json');if(cached.ok)applyRates(await cached.json());}catch{}try{const r=await fetch('/api/rates');if(!r.ok)return;const d=await r.json();if(Object.keys(d.rates||{}).length>1)applyRates(d);}catch{}}
function applyRates(data){const clean={GBP:1};for(const [k,v]of Object.entries(data.rates||{})){if(/^[A-Z]{3}$/.test(k)&&typeof v==='number'&&v>0&&v<1e10)clean[k]=v;}displayCurrency.rates=clean;displayCurrency.updated=data.updated||data.time_last_update_utc||null;}
