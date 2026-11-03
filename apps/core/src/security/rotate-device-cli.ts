/**
 * Local Mac maintenance command: generate a one-time code to re-pair the
 * existing iPhone after a non-biometric Secure Enclave key update.
 * No HTTP listener. No old key, old session or bootstrap row is deleted.
 *
 * From apps/core: npm run auth:rotate-device
 * If multiple active devices: npm run auth:rotate-device -- --device-id iphone-...
 */
import {existsSync} from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import {DeviceSessions} from './device-session.js';

const envFile=path.resolve('.env');
if(existsSync(envFile))process.loadEnvFile(envFile);
const owner=process.env.CORE_OWNER_ID?.trim();
if(!owner)throw new Error('CORE_OWNER_ID_MISSING');
const dbFile=path.resolve(process.env.DB_FILE??'./ahmed-core.db');
if(!existsSync(dbFile))throw new Error('CORE_DB_NOT_FOUND: refusing to create a new database');
const db=new Database(dbFile,{fileMustExist:true});
try{
  db.pragma('busy_timeout = 5000');
  const devices=new DeviceSessions(db,owner,null);
  const args=process.argv.slice(2), index=args.indexOf('--device-id');
  if(args.length>0&&(index!==0||args.length!==2))
    throw new Error('USAGE: npm run auth:rotate-device -- --device-id iphone-...');
  let deviceId=index===0?args[1]:null;
  if(!deviceId){
    const available=db.prepare('SELECT device_id FROM security_devices'+
      ' WHERE owner_id=? AND revoked_at IS NULL').all(owner) as {device_id:string}[];
    if(available.length!==1)
      throw new Error('EXPECTED_ONE_ACTIVE_DEVICE: provide --device-id for multiple devices');
    deviceId=available[0].device_id;
  }
  const out=devices.issueLocalRotationCode(deviceId);
  console.log('DEVICE_ID='+deviceId);
  console.log('ONE_TIME_DEVICE_REPAIR_CODE='+out.code);
  console.log('EXPIRES_AT='+new Date(out.expiresAt).toISOString());
  console.log('Old device public key remains registered until a NEW key signs the enrollment challenge.');
  console.log('Enter this one-time code in the existing iPhone pairing screen. Do not share or commit it.');
}finally{db.close();}
