// Adds YC Atlas (run from this checkout) to the Linux app menu, so GNOME and
// other desktops show its icon in the dock and window switcher. Desktops match
// a window to a launcher by app ID: Electron sets it from package.json
// desktopName, so the launcher file must use the same name.
// Usage: npm run install:linux-desktop [-- --remove]
import {mkdir,readFile,rm,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

if(process.platform!=='linux')throw new Error('The app menu launcher is for Linux. macOS uses the Dock icon set by the app.');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const pkg=JSON.parse(await readFile(path.join(root,'package.json'),'utf8'));
const id=pkg.desktopName.replace(/\.desktop$/,'');
const applications=path.join(process.env.XDG_DATA_HOME||path.join(os.homedir(),'.local/share'),'applications');
const file=path.join(applications,pkg.desktopName);
const refresh=()=>spawnSync('update-desktop-database',[applications],{stdio:'ignore'});

if(process.argv.includes('--remove')){await rm(file,{force:true});refresh();console.log(`Removed ${file}`);process.exit(0);}

const electron=path.join(root,'node_modules/electron/dist/electron'),icon=path.join(root,'assets/icon.png');
if(!existsSync(electron))throw new Error('Electron is not installed. Run npm ci.');
// Desktop Entry spec: quote Exec arguments, escape the shell-reserved characters
// inside quotes, then escape backslashes again for the string value.
const arg=value=>'"'+value.replace(/["`$\\]/g,'\\$&').replaceAll('\\','\\\\').replaceAll('%','%%')+'"';
const value=text=>text.replace(/[\n\r\t\\]/g,c=>({'\n':'\\n','\r':'\\r','\t':'\\t','\\':'\\\\'})[c]);
const entry=['[Desktop Entry]','Type=Application',`Name=${value(pkg.productName)}`,`Comment=${value(pkg.description)}`,
 `Exec=${arg(electron)} ${arg(root)}`,`Path=${value(root)}`,`Icon=${value(icon)}`,'Terminal=false','Categories=Office;',`StartupWMClass=${id}`,''].join('\n');
await mkdir(applications,{recursive:true});await writeFile(file,entry,{mode:0o644});refresh();
console.log(`Installed ${file}\nOpen YC Atlas from the app menu, or keep using npm start: both now show the YC Atlas icon.\nRemove it with: npm run install:linux-desktop -- --remove`);
