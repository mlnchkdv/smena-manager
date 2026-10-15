import 'dotenv/config';
import { getAccessProfiles } from '../src/server/auth.js';
import { inspectDeploymentConfig } from '../src/server/deployment-config.js';

let profiles = [];
let profileError = '';
try {
  profiles = getAccessProfiles().filter(profile => profile.active);
} catch (error) {
  profileError = error.message;
}

const report = inspectDeploymentConfig({ profiles, profileError });

console.log(`Smena Manager production configuration: ${report.ready ? 'READY' : 'NOT READY'}`);
console.log(`Access profiles: ${report.profileCount}`);
console.log(`Google Drive credentials: ${report.credentialMode || 'missing'}`);
for (const issue of report.issues) console.error(`ERROR ${issue.key}: ${issue.message}`);
for (const warning of report.warnings) console.warn(`WARN  ${warning.key}: ${warning.message}`);

if (!report.ready) process.exitCode = 1;
