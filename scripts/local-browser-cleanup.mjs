// Local QA only: explicitly unmount live observers before closing owned pages.
// Abrupt WebChannel closure can retain targets in the Firestore emulator.
export async function closeLocalTestContext(context){
 for(const page of context.pages()){
  if(page.isClosed())continue;const url=new URL(page.url());
  if(['about:','blob:','chrome-error:','chrome-extension:','edge:'].includes(url.protocol))continue;
  if(!['http://127.0.0.1:5173','http://localhost:5173'].includes(url.origin))throw Error('Only owned literal-loopback app pages may be signed out by local QA.');
  const hadUser=await page.evaluate(async()=>{const [{auth},{signOut}]=await Promise.all([import('/lib/firebase.js'),import('/node_modules/.vite/deps/firebase_auth.js')]);const hadUser=Boolean(auth?.currentUser);if(hadUser)await signOut(auth);return hadUser;});
  if(hadUser){await page.waitForFunction(()=>Boolean(document.querySelector('.login-form input[type="email"]')),{},{timeout:15000});await page.waitForTimeout(150);}
 }
 await context.close();
}
