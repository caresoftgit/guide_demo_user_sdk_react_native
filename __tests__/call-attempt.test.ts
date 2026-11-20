import {createCallAttempt} from '../src/callAttempt';
function deferred(){let resolve!:(value?:any)=>void;const promise=new Promise<any>(r=>{resolve=r});return {promise,resolve}}
test('ambiguous create keeps another tap blocked until authoritative synchronize finishes',async()=>{
 const sync=deferred();let creates=0;const busy:boolean[]=[];
 const attempt=createCallAttempt(async()=>{creates++;throw Error('lost response')},()=>sync.promise,b=>busy.push(b));
 const first=attempt.call();await Promise.resolve();expect(creates).toBe(1);
 await attempt.call();expect(creates).toBe(1);expect(busy).toEqual([true]);
 sync.resolve();await expect(first).rejects.toThrow('lost response');expect(busy).toEqual([true,false]);
});
test('failed synchronization leaves call blocked until a later successful sync',async()=>{
 let creates=0,fail=true;const attempt=createCallAttempt(async()=>{creates++;throw Error('offline')},async()=>{if(fail)throw Error('offline')},()=>{});
 await expect(attempt.call()).rejects.toThrow();await attempt.call();expect(creates).toBe(1);
 fail=false;await attempt.synchronize();await expect(attempt.call()).rejects.toThrow();expect(creates).toBe(2);
});

test('reattached Home waits for an initial authoritative sync',async()=>{
 let creates=0;const attempt=createCallAttempt(async()=>{creates++},async()=>{},()=>{},true);
 await attempt.call();expect(creates).toBe(0);await attempt.synchronize();await attempt.call();expect(creates).toBe(1);
});
