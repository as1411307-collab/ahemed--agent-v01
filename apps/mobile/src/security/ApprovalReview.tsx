/**
 * REVIEW-ONLY scaffold: not connected to Fastify signed-approval endpoint.
 * Native iOS module cannot run in Expo Go. No JS crypto key fallback.
 */
import React,{useState} from 'react';
import {ActivityIndicator,Pressable,ScrollView,Text,View} from 'react-native';
import EnclaveSigner from '../../modules/enclave-signer';
import {approvalDisplayRows,approvalCanonicalText,approvalSignedText,type DisplayEnvelope} from './approval-display';

export function ApprovalReview(props:{
  envelope:DisplayEnvelope;
  onSigned:(signatureDerBase64:string)=>Promise<void>;
  onReject:()=>void;
}){
  // Freeze the reviewed action snapshot so it cannot change between display and signing.
  const [snapshot]=useState<DisplayEnvelope>(()=>JSON.parse(JSON.stringify(props.envelope)) as DisplayEnvelope);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const rows=approvalDisplayRows(snapshot);
  async function approve(){
    if(busy)return;
    setBusy(true);setError(null);
    try{
      const bytes=approvalSignedText(snapshot);
      const signature=await EnclaveSigner.signApprovalBytes(bytes);
      await props.onSigned(signature);
    }catch(e){setError(e instanceof Error?e.message:'تعذر التوقيع');}
    finally{setBusy(false);}
  }
  return <ScrollView contentContainerStyle={{padding:20,gap:16}}>
    <Text style={{fontSize:21,fontWeight:'bold'}}>راجع الأمر قبل التوقيع</Text>
    <Text>اقرأ الوجهة والمعاملات. جميع القيم مأخوذة من نفس الكائن الموقع.</Text>
    {rows.map(row=><View key={row.label} style={{gap:4}}>
      <Text style={{fontWeight:'bold'}}>{row.label}</Text>
      <Text selectable style={{fontFamily:'monospace'}}>{row.value}</Text>
    </View>)}
    <Text style={{fontWeight:'bold'}}>Exact signed data (canonical JSON)</Text>
    <Text selectable style={{fontFamily:'monospace',fontSize:11}}>{approvalCanonicalText(snapshot)}</Text>
    {error?<Text accessibilityRole='alert'>{error}</Text>:null}
    <Pressable accessibilityRole='button' disabled={busy} onPress={approve}>
      {busy?<ActivityIndicator/>:<Text>أوافق وأوقّع</Text>}
    </Pressable>
    <Pressable accessibilityRole='button' disabled={busy} onPress={props.onReject}><Text>رفض</Text></Pressable>
  </ScrollView>;
}