// Isolated production preview only. Intercepts assets, never modifies a deployment.
// prettier-ignore
async page => {
  if (!page.url().startsWith('http://127.0.0.1:5195')) throw new Error('Isolated preview only');
  await page.route('**/app-version.json',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({version:'isolated-next-version'})}));
  await page.route('**/assets/drawer-content-*.js',route=>route.abort());
  await page.goto('http://127.0.0.1:5195/layout-qa/knowledge');
  await page.locator('.knowledge-preview-open').first().click();
  const update=page.getByRole('button',{name:/^(Update and reopen|Обновить и открыть снова)$/});
  await update.waitFor();
  if(!await update.isEnabled())throw new Error('Failed reader blocks safe recovery');
  await page.unroute('**/assets/drawer-content-*.js');
  await update.click();
  await page.locator('.knowledge-drawer h1').waitFor();
  const restored=await page.locator('.knowledge-drawer h1').innerText();
  await page.getByRole('button',{name:/^(Edit note|Редактировать заметку)$/}).click();
  const blocked=await page.getByRole('button',{name:/^(Update app|Обновить приложение)$/}).isEnabled();
  if(blocked)throw new Error('Editor allowed unsafe deployment reload');
  await page.locator('.knowledge-drawer [data-a="closeKnowledgeDrawer"]').click();
  await page.unroute('**/app-version.json');
  return {restored,unsafeEditorBlocked:true,interception:'local assets only'};
}
