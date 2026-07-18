import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { CORPUS_DIR, INSTR_DIR } from './suntronicLib';
import { parseSunTronicV13Score } from '../../src/lib/import/formats/SunTronicV13';
import { renderSunTronicMix } from '../../src/engine/suntronic/SunTronicNativeRender';
import { renderUADEPerVoice } from './audio-oracle';

function rms(x: Float32Array){let s=0;for(let i=0;i<x.length;i++)s+=x[i]*x[i];return Math.sqrt(s/x.length);}
// crude low-band energy via 1-pole lowpass (~250Hz) then rms
function lowRms(x: Float32Array, sr: number, fc=250){
  const a = Math.exp(-2*Math.PI*fc/sr); let y=0,s=0;
  for(let i=0;i<x.length;i++){y=(1-a)*x[i]+a*y;s+=y*y;} return Math.sqrt(s/x.length);
}
// temporal envelope variance (flatness): 1 - (mean/peak) of 20ms rms env → higher=more movement
function movement(x: Float32Array, sr: number){
  const w=Math.floor(sr*0.02); const env:number[]=[];
  for(let i=0;i+w<=x.length;i+=w){let s=0;for(let k=0;k<w;k++)s+=x[i+k]*x[i+k];env.push(Math.sqrt(s/w));}
  const mx=Math.max(1e-9,...env); const norm=env.map(e=>e/mx);
  const mean=norm.reduce((a,b)=>a+b,0)/norm.length;
  let v=0;for(const e of norm)v+=(e-mean)**2;return Math.sqrt(v/norm.length);
}
async function main(){
  const name=process.env.SONG??'ready'; const seconds=Number(process.env.SECS??10);
  const oracle=await renderUADEPerVoice(name,{seconds}); const osr=oracle.sampleRate;
  const data=new Uint8Array(readFileSync(join(CORPUS_DIR,name)));
  const score=parseSunTronicV13Score(data);
  const slotPcm=(score.instrumentNames as string[]).map(n=>{const p=join(INSTR_DIR,n);return existsSync(p)?new Int8Array(readFileSync(p)):null;});
  const m=renderSunTronicMix(score,slotPcm,{seconds}); const nsr=m.sampleRate??44100;
  console.log(`voice |  oracleRMS  nativeRMS  ratioN/O |  oracleLow nativeLow lowRatio | oracleMov nativeMov`);
  for(let v=0;v<4;v++){
    const o=oracle.ch[v], n=m.ch[v];
    const oR=rms(o),nR=rms(n),oL=lowRms(o,osr),nL=lowRms(n,nsr),oM=movement(o,osr),nM=movement(n,nsr);
    console.log(`  ${v}   |  ${oR.toFixed(4)}    ${nR.toFixed(4)}    ${(nR/(oR||1e-9)).toFixed(2)}   |  ${oL.toFixed(4)}   ${nL.toFixed(4)}    ${(nL/(oL||1e-9)).toFixed(2)}   |  ${oM.toFixed(3)}    ${nM.toFixed(3)}`);
  }
}
main().catch(e=>{console.error(e);process.exit(1);});
