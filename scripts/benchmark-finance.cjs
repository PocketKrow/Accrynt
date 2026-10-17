const {performance}=require('node:perf_hooks');
const Module=require('node:module');
const root=require('node:path').resolve(process.argv[2] || require('node:path').join(__dirname,'..'));
const {buildSync}=require(root+'/node_modules/esbuild');
const source=buildSync({entryPoints:[root+'/src/domain/finance.ts'],bundle:true,platform:'node',format:'cjs',write:false}).outputFiles[0].text;
const compiled=new Module(root+'/finance-benchmark.cjs',module);compiled.filename=root+'/finance-benchmark.cjs';compiled.paths=Module._nodeModulePaths(root);compiled._compile(source,compiled.filename);const f=compiled.exports;
const stamp='2026-10-16T16:00:00.000Z',through='2026-10-16';
const obligations=Array.from({length:2000},(_,i)=>({id:'bill-'+i,month:'2026-10',name:'Synthetic '+i,category:'Utilities',plannedCents:10000,paidAt:i%17===0?stamp:null,dueDay:15,debtId:null,updatedAt:stamp}));
const transactions=Array.from({length:20000},(_,i)=>({id:'tx-'+i,date:i%5===0?'2026-10-25':i%7===0?'2026-09-30':'2026-10-15',name:'Synthetic '+i,kind:i%11===0?'income':'expense',amountCents:1000,obligationId:'bill-'+i%2000,account:'',category:'Utilities',payment:null,updatedAt:stamp}));
function median(fn){const samples=[];let checksum;for(let i=0;i<5;i++){const start=performance.now();checksum=fn();samples.push(performance.now()-start)}samples.sort((a,b)=>a-b);return{medianMs:+samples[2].toFixed(3),checksum};}
const status=median(()=>{const index=f.buildObligationPayments?.(obligations,transactions,through);const summary=f.monthlySummary('2026-10',30000000,obligations,transactions,through,index);const cash=f.availableMoney('2026-10',10000,obligations,transactions,through,index);let remainder=0;for(const row of obligations)remainder+=(index?.get(row.id)??f.obligationPayment(row,transactions,through)).remainingCents;return [summary.paidCount,summary.actualOutflowCents,cash.trackedCents,remainder]});
const formatting=median(()=>{let chars=0;for(let i=0;i<10000;i++)chars+=f.formatMoney(i*12345).length;return chars});
console.log(JSON.stringify({obligations:2000,transactions:20000,iterations:5,status,formatting}));
