/** Bound bytes before allocation, including chunked responses and missing length headers. */
export async function responseText(response:Response,maxBytes=2_000_000):Promise<string>{
 const declared=response.headers.get('content-length');if(declared&&(!/^\d+$/.test(declared)||Number(declared)>maxBytes)){await response.body?.cancel();throw new Error('Response exceeds byte limit.');}
 if(!response.body)return '';
 const reader=response.body.getReader(),decoder=new TextDecoder();let bytes=0,text='';
 try{while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>maxBytes)throw new Error('Response exceeds byte limit.');text+=decoder.decode(value,{stream:true});}return text+decoder.decode();}
 finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
}
