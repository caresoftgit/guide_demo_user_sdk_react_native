/** Never replay create; an ambiguous response must be reconciled before the next tap. */
export function createCallAttempt(create:()=>Promise<unknown>,sync:()=>Promise<unknown>,changed:(blocked:boolean)=>void,initiallyBlocked=false){
 let blocked=initiallyBlocked;
 async function synchronize(){await sync();blocked=false;changed(false)}
 return {synchronize,async call(){
  if(blocked)return;
  blocked=true;changed(true);
  try {await create();blocked=false;changed(false)}
  catch(error){try{await synchronize()}catch{/* Remain blocked until an explicit successful synchronization. */}throw error}
 }};
}
