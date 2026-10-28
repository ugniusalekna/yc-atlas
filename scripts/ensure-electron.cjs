// Electron releases may download their executable lazily; prepare it before packaging.
const {existsSync}=require('node:fs');
const executable=require('electron');
if(!existsSync(executable))throw new Error('Electron executable is missing. Run npm install and retry.');
console.log('Electron executable ready.');
