export async function durableToolResult(result,{mutation=false,workspace,onSaving}={}){
  if(result?.storage?.saved===true)return result;
  if(result?.ok===false || result?.requiresConfirmation || !(result?.saved || mutation))return result;
  if(!workspace)throw new Error('ยังเชื่อมฐานข้อมูลไม่ได้ค่ะ');
  onSaving?.();
  await workspace.flush();
  return {...result,storage:{saved:true,revision:workspace.revision}};
}
