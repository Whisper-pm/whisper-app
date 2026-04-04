const { createUnlinkClient, BurnerWallet, unlinkAccount } = require("@unlink-xyz/sdk");
const { createPublicClient, createWalletClient, http, formatUnits, pad, keccak256, encodePacked } = require("viem");
const { privateKeyToAccount } = require("viem/accounts");
const { baseSepolia } = require("viem/chains");
const crypto = require("crypto"); const fs = require("fs");

const PK="0xdea8e161ca1ec9f639cba991498c675a58dfd12cd205457f0b96f6b75d14e7c5";
// Use old wallet as relayer (has 0.017 MATIC)
const RELAY_PK="0x47b0a088fc62101d8aefc501edec2266ff2fc4cf84c93a8e6c315dedb0d942be";
const USDC="0x036CbD53842c5426634e7929541eC2318f3dCF7e";const USDC_AMOY="0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582";
const TM="0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA";const MSG_TX="0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275";
const CTF="0x69308FB512518e39F9b16112fA8d994F4e2Bf8bB";const Z="0x"+"0".repeat(64);
const account=privateKeyToAccount(PK);const relayer=privateKeyToAccount(RELAY_PK);
const basePub=createPublicClient({chain:baseSepolia,transport:http("https://sepolia.base.org")});
const amoyC={id:80002,name:"Amoy",nativeCurrency:{name:"MATIC",symbol:"MATIC",decimals:18},rpcUrls:{default:{http:["https://rpc-amoy.polygon.technology"]}}};
const amoyPub=createPublicClient({chain:amoyC,transport:http("https://rpc-amoy.polygon.technology")});
const seed=new Uint8Array(crypto.createHash("sha512").update("whisper-new-wallet-"+account.address).digest());
const erc20=[{name:"approve",type:"function",stateMutability:"nonpayable",inputs:[{name:"s",type:"address"},{name:"a",type:"uint256"}],outputs:[{type:"bool"}]},{name:"balanceOf",type:"function",stateMutability:"view",inputs:[{type:"address"}],outputs:[{type:"uint256"}]}];
const tmAbi=[{name:"depositForBurn",type:"function",stateMutability:"payable",inputs:[{name:"a",type:"uint256"},{name:"d",type:"uint32"},{name:"m",type:"bytes32"},{name:"b",type:"address"},{name:"c",type:"bytes32"},{name:"f",type:"uint256"},{name:"t",type:"uint32"}],outputs:[]}];
const mtAbi=[{name:"receiveMessage",type:"function",stateMutability:"nonpayable",inputs:[{name:"m",type:"bytes"},{name:"a",type:"bytes"}],outputs:[{type:"bool"}]}];
const ctfAbi=[{name:"prepareCondition",type:"function",stateMutability:"nonpayable",inputs:[{name:"o",type:"address"},{name:"q",type:"bytes32"},{name:"n",type:"uint256"}],outputs:[]},{name:"splitPosition",type:"function",stateMutability:"nonpayable",inputs:[{name:"c",type:"address"},{name:"p",type:"bytes32"},{name:"id",type:"bytes32"},{name:"part",type:"uint256[]"},{name:"a",type:"uint256"}],outputs:[]}];
const t0=Date.now();const ts=()=>((Date.now()-t0)/1000).toFixed(1)+"s";
const ms={};const mark=k=>ms[k]=Date.now();const dur=(a,b)=>((ms[b]-ms[a])/1000).toFixed(1);
async function stx(wc,pub,addr,p){const n=await pub.getTransactionCount({address:addr});const h=await wc.writeContract({...p,nonce:n});await pub.waitForTransactionReceipt({hash:h});return h;}

(async()=>{
  console.log("╔══════════════════════════════════════════════╗");
  console.log("║  WHISPER — FULL E2E BET (0.1 USDC)           ║");
  console.log("╚══════════════════════════════════════════════╝\n");

  const keys=await unlinkAccount.fromSeed({seed}).getAccountKeys();
  const api=createUnlinkClient("https://staging-api.unlink.xyz","AkzGeutvPPQULpjAiyt3Wv");

  mark("s1");console.log(`[${ts()}] 1. Burner + fundFromPool`);
  const burner=await BurnerWallet.create();
  await burner.fundFromPool(api,{senderKeys:keys,token:USDC,amount:"100000",environment:"base-sepolia"});
  let uB=0n,eB=0n;
  for(let i=0;i<20;i++){await new Promise(r=>setTimeout(r,3000));uB=await basePub.readContract({address:USDC,abi:erc20,functionName:"balanceOf",args:[burner.address]});eB=await basePub.getBalance({address:burner.address});if(uB>0n&&eB>0n)break;}
  mark("e1");console.log(`[${ts()}]    ${formatUnits(uB,6)} USDC + ${formatUnits(eB,18)} ETH — ${dur("s1","e1")}s`);
  if(!uB||!eB){console.log("FAIL");return;}

  mark("s2");console.log(`[${ts()}] 2. CCTP approve + burn`);
  const bv=burner.toViemAccount();const bwc=createWalletClient({account:bv,chain:baseSepolia,transport:http("https://sepolia.base.org")});
  await stx(bwc,basePub,burner.address,{address:USDC,abi:erc20,functionName:"approve",args:[TM,uB]});
  await new Promise(r=>setTimeout(r,2000));
  const burnTx=await stx(bwc,basePub,burner.address,{address:TM,abi:tmAbi,functionName:"depositForBurn",args:[uB,7,pad(burner.address,{size:32}),USDC,Z,uB/50n,1000]});
  mark("e2");console.log(`[${ts()}]    Burn: ${burnTx.substring(0,20)}... — ${dur("s2","e2")}s`);

  mark("s3");console.log(`[${ts()}] 3. Attestation`);
  let att=null;
  for(let i=0;i<90;i++){await new Promise(r=>setTimeout(r,5000));try{const r=await fetch(`https://iris-api-sandbox.circle.com/v2/messages/6?transactionHash=${burnTx}`);if(r.ok){const d=await r.json();if(d?.messages?.[0]?.status==="complete"){att=d.messages[0];break;}}}catch{}if(i%12===0&&i>0)console.log(`[${ts()}]    ${i*5}s...`);}
  if(!att){console.log("TIMEOUT");return;}
  mark("e3");console.log(`[${ts()}]    Done — ${dur("s3","e3")}s`);

  mark("s4");console.log(`[${ts()}] 4. Relay + fund MATIC`);
  const rlWc=createWalletClient({account:relayer,chain:amoyC,transport:http("https://rpc-amoy.polygon.technology")});
  const rcvTx=await stx(rlWc,amoyPub,relayer.address,{address:MSG_TX,abi:mtAbi,functionName:"receiveMessage",args:[att.message,att.attestation]});
  console.log(`[${ts()}]    receiveMessage OK`);
  const gn=await amoyPub.getTransactionCount({address:relayer.address});
  const gTx=await rlWc.sendTransaction({to:burner.address,value:2000000000000000n,nonce:gn}); // 0.002 MATIC
  await amoyPub.waitForTransactionReceipt({hash:gTx});
  const ab=await amoyPub.readContract({address:USDC_AMOY,abi:erc20,functionName:"balanceOf",args:[burner.address]});
  mark("e4");console.log(`[${ts()}]    ${formatUnits(ab,6)} USDC + 0.002 MATIC — ${dur("s4","e4")}s`);

  mark("s5");console.log(`[${ts()}] 5. Bet on Polymarket`);
  const ba=createWalletClient({account:bv,chain:amoyC,transport:http("https://rpc-amoy.polygon.technology")});
  const q="Will ETH reach $10K by end of 2026?";
  const qId=keccak256(encodePacked(["string"],[q]));
  const cId=keccak256(encodePacked(["address","bytes32","uint256"],[burner.address,qId,2n]));
  try{await stx(ba,amoyPub,burner.address,{address:CTF,abi:ctfAbi,functionName:"prepareCondition",args:[burner.address,qId,2n]});}catch(e){console.log(`[${ts()}]    condition exists`);}
  await stx(ba,amoyPub,burner.address,{address:USDC_AMOY,abi:erc20,functionName:"approve",args:[CTF,ab]});
  const sp=await stx(ba,amoyPub,burner.address,{address:CTF,abi:ctfAbi,functionName:"splitPosition",args:[USDC_AMOY,Z,cId,[1n,2n],ab]});
  mark("e5");console.log(`[${ts()}]    BET PLACED: ${sp.substring(0,20)}... — ${dur("s5","e5")}s`);

  const total=((Date.now()-t0)/1000).toFixed(1);
  console.log(`
╔══════════════════════════════════════════════╗
║ 1. Burner + fund:   ${dur("s1","e1").padStart(7)}s                ║
║ 2. CCTP burn:       ${dur("s2","e2").padStart(7)}s                ║
║ 3. Attestation:     ${dur("s3","e3").padStart(7)}s                ║
║ 4. Relay + MATIC:   ${dur("s4","e4").padStart(7)}s                ║
║ 5. Polymarket bet:  ${dur("s5","e5").padStart(7)}s                ║
╠══════════════════════════════════════════════╣
║ TOTAL:              ${total.padStart(7)}s                ║
╚══════════════════════════════════════════════╝`);

  const store=fs.existsSync("wallets.json")?JSON.parse(fs.readFileSync("wallets.json","utf-8")):{burners:[]};
  store.burners.push({burnerAddress:burner.address,createdAt:new Date().toISOString(),parentEvmAddress:account.address,market:q,side:"YES",amount:"0.1",status:"bet_placed",txHashes:{cctpBurn:burnTx,cctpReceive:rcvTx,splitPosition:sp}});
  fs.writeFileSync("wallets.json",JSON.stringify(store,null,2));
  console.log("wallets.json ✓");
})().catch(e=>console.error("FATAL:",e.message));
