import {spawn} from 'node:child_process';
import {EventEmitter} from 'node:events';
export class CodexClient extends EventEmitter{
 constructor({binary,home,cwd,key,platformPath,spawnImpl=spawn}){super();Object.assign(this,{binary,home,cwd,key,platformPath,spawnImpl});this.pending=new Map();this.next=1;this.buffer='';}
 async start(){if(this.ready)return this.ready;this.ready=this.boot();try{return await this.ready;}catch(error){this.close();throw error;}}
 async boot(){
  const env=Object.fromEntries(['HOME','USERPROFILE','SystemRoot','WINDIR','TEMP','TMP','TMPDIR','LANG','LC_ALL','SSL_CERT_FILE','SSL_CERT_DIR'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));env.PATH=[this.platformPath,process.env.PATH].filter(Boolean).join(process.platform==='win32'?';':':');env.CODEX_HOME=this.home;if(this.key)env.ATLAS_CODEX_API_KEY=this.key;
  const config=['project_doc_max_bytes=0','default_permissions="atlas"','analytics.enabled=false','otel.metrics_exporter="none"','features.shell_snapshot=false','shell_environment_policy.inherit="none"','shell_environment_policy.set.PATH='+JSON.stringify([this.platformPath,'/opt/homebrew/bin','/usr/local/bin','/usr/bin','/bin','/usr/sbin','/sbin'].filter(Boolean).join(process.platform==='win32'?';':':')),'cli_auth_credentials_store="keyring"','permissions.atlas.filesystem={":minimal"="read",":workspace_roots"={"."="write"}}','permissions.atlas.network.enabled=false'];
  if(this.key)config.push('model_provider="atlas_openai"','model_providers.atlas_openai.name="OpenAI API"','model_providers.atlas_openai.base_url="https://api.openai.com/v1"','model_providers.atlas_openai.env_key="ATLAS_CODEX_API_KEY"','model_providers.atlas_openai.wire_api="responses"','model_providers.atlas_openai.requires_openai_auth=false','model_providers.atlas_openai.supports_websockets=false');
  this.child=this.spawnImpl(this.binary,['app-server','--listen','stdio://',...config.flatMap(c=>['-c',c])],{cwd:this.cwd,env,stdio:['pipe','pipe','pipe'],windowsHide:true});
  this.child.stdout.setEncoding('utf8');this.child.stdout.on('data',chunk=>{this.buffer+=chunk;let at;while((at=this.buffer.indexOf('\n'))>=0){const line=this.buffer.slice(0,at);this.buffer=this.buffer.slice(at+1);if(line.trim())try{this.receive(JSON.parse(line));}catch{this.fail(new Error('Codex sent an invalid protocol response.'));}}});
  this.child.stderr.on('data',()=>{});this.child.on('error',error=>this.fail(new Error('Unable to start the bundled Codex runtime: '+error.message)));this.child.on('exit',()=>this.fail(new Error('Codex stopped. Send the message again to resume.')));
  const result=await this.call('initialize',{clientInfo:{name:'yc_atlas',title:'YC Atlas',version:'1.0.0'},capabilities:{experimentalApi:true}});this.write({method:'initialized',params:{}});return result;
 }
 receive(message){if(message.method){this.emit(message.id!==undefined?'request':'notification',message);return;}const pending=this.pending.get(message.id);if(!pending)return;this.pending.delete(message.id);clearTimeout(pending.timer);message.error?pending.reject(new Error(message.error.message||'Codex request failed.')):pending.resolve(message.result);}
 write(message){if(!this.child?.stdin?.writable)throw new Error('Codex is not running.');this.child.stdin.write(JSON.stringify(message)+'\n');}
 call(method,params={},timeout=30000){return new Promise((resolve,reject)=>{const id=this.next++,timer=setTimeout(()=>{this.pending.delete(id);reject(new Error('Codex request timed out: '+method));},timeout);this.pending.set(id,{resolve,reject,timer});try{this.write({id,method,params});}catch(error){clearTimeout(timer);this.pending.delete(id);reject(error);}});}
 async request(method,params,timeout){await this.start();return this.call(method,params,timeout);}
 respond(id,result){this.write({id,result});}
 fail(error){for(const {timer,reject}of this.pending.values()){clearTimeout(timer);reject(error);}this.pending.clear();this.ready=null;this.emit('stopped',error);}
 close(){const child=this.child;this.child=null;this.ready=null;if(!child)return Promise.resolve();return new Promise(resolve=>{const timer=setTimeout(()=>{child.kill('SIGKILL');resolve();},3000);timer.unref?.();child.once('exit',()=>{clearTimeout(timer);resolve();});child.stdin?.end();child.kill();});}
}
