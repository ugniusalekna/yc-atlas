import {copyFile,mkdir,readFile,access} from 'node:fs/promises';
import {constants} from 'node:fs';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {codexLocation} from '../electron/codex-runtime.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const {binary}=codexLocation(root);
await access(binary,constants.X_OK);
const pkg=JSON.parse(await readFile(path.join(root,'package.json'),'utf8'));
const version=spawnSync(binary,['--version'],{encoding:'utf8'});
if(version.status!==0||version.stdout.trim()!==`codex-cli ${pkg.dependencies['@openai/codex']}`)throw new Error('Installed Codex version does not match the pinned application runtime. Run npm ci.');
const vendor=path.join(root,'dist/vendor');await mkdir(vendor,{recursive:true});
await copyFile(path.join(root,'node_modules/marked/lib/marked.umd.js'),path.join(vendor,'marked.umd.js'));
await copyFile(path.join(root,'node_modules/dompurify/dist/purify.min.js'),path.join(vendor,'purify.min.js'));
await copyFile(path.join(root,'node_modules/marked/LICENSE'),path.join(vendor,'marked.LICENSE.md'));
await copyFile(path.join(root,'node_modules/dompurify/LICENSE'),path.join(vendor,'dompurify.LICENSE'));
console.log(`Bundled ${version.stdout.trim()} and local Markdown libraries ready.`);
