// Ephemeral read-model probes only; never save the synthetic data to an API.
// prettier-ignore
async page => {
  if (!page.url().startsWith('http://127.0.0.1:5194')) throw new Error('Isolated dev fixture only');
  await page.reload();
  const login=page.getByRole('textbox',{name:'Идентификатор доступа',exact:true});
  await page.waitForFunction(()=>document.querySelector('#l-access') || window.__smena?.S.ui.currentUser);
  if (await login.isVisible()) { await login.fill('density-layout-test-id-2026'); await page.getByRole('button',{name:'Войти',exact:true}).click(); }
  await page.waitForFunction(()=>window.__smena?.S.ui.currentUser && location.pathname.startsWith('/layout-qa'));
  const check=(value,message)=>{if(!value)throw new Error(message);};
  await page.evaluate(()=>{const {S}=window.__smena; window.__r14Backup={data:structuredClone(S.data),prefs:{...S.prefs},role:S.ui.currentUser.role};});
  try {
    for (const lang of ['ru','en']) {
      await page.setViewportSize({width:390,height:845});
      await page.evaluate(lang=>{const {S,D,go}=window.__smena; S.prefs.lang=lang; S.ui.currentUser.role='admin'; D().knowledgeNotes=[{id:'r14-a',title:'QA Source',formatted_markdown:'See [[QA Target]].',wikiRefs:[{label:'QA Target',target:'r14-b'}],tags:[],updatedAt:Date.now()},{id:'r14-b',title:'QA Renamed Target',formatted_markdown:'Target content',tags:[],updatedAt:Date.now()}]; S.ui.knowledgeFolder='all';S.ui.knowledgeQuery='';S.ui.knowledgeTag='';go('knowledge');},lang);
      await page.locator('.knowledge-preview-open').filter({hasText:'QA Source'}).click();
      await page.locator('[data-a="followKnowledgeWiki"]').click();
      check((await page.locator('.knowledge-drawer h1').innerText())==='QA Renamed Target','Stable wiki identity lost');
      await page.locator('[data-a="backKnowledgeWiki"]').click();
      check((await page.locator('.knowledge-drawer h1').innerText())==='QA Source','Wiki return failed');
      await page.locator('.knowledge-drawer [data-a="closeKnowledgeDrawer"]').click();
      await page.evaluate(()=>{const {S,D,go}=window.__smena; D().links=Array.from({length:130},(_,i)=>({id:'r14-'+i,title:'QA Resource '+i,url:'https://example.test/'+i,description:'Полное описание. Full description. '.repeat(100),created_at:'2026-01-01'}));S.ui.bookmarkQuery='';S.ui.bookmarkFolder='all';S.ui.bookmarkScope='active';go('bookmarks');});
      await page.locator('[data-a="listPage"][data-page="1"]').click();
      check((await page.locator('.bookmark-title').first().innerText()).includes('60'),'Bookmark page missing');
      await page.locator('#bookmark-search').fill('QA Resource');
      check((await page.locator('.bookmark-title').first().innerText()).includes('0'),'New query did not reset page');
      await page.evaluate(()=>{const {S,render}=window.__smena;S.ui.currentUser.role='viewer';render();});
      check(await page.locator('[data-a="editBookmark"]').count()===0,'Viewer edit action leaked');
      await page.locator('.bookmark-reading-details > summary').first().click();
      check((await page.locator('.bookmark-reading-details[open] p').innerText()).length>2500,'Full description inaccessible');
      await page.evaluate(()=>window.__smena.go('home'));
      await page.locator('.home-page h1').waitFor();
      check(await page.locator('.home-page [data-a="newTask"]').count()===0,'Viewer home creation visible');
      await page.evaluate(()=>{const {S,D,go}=window.__smena;S.ui.currentUser.role='admin';D().knowledgeNotes=Array.from({length:75},(_,id)=>({id:'s'+id,title:'R14Guide '+id,formatted_markdown:'guide',tags:[]}));S.ui.searchQ='R14Guide';S.ui.searchCat='knowledge';go('search');});
      await page.evaluate(()=>{window.__smena.S.ui.searchPageContext=null;window.__smena.render();});
      await page.locator('#search-page-q').waitFor();
      const nextSearch=page.locator('[data-a="searchPage"][data-key="knowledge"][data-offset="30"]');
      if (!await nextSearch.count()) throw new Error(JSON.stringify(await page.evaluate(()=>({query:window.__smena.S.ui.searchQ,count:window.__smena.D().knowledgeNotes.length,text:document.querySelector('.search-page')?.textContent}))));
      await nextSearch.click();
      check((await page.locator('[data-a="goKnowledgeNote"]').first().innerText()).includes('30'),'Search continuation failed');
    }
    const touch=await page.context().browser().newContext({storageState:await page.context().storageState(),viewport:{width:1024,height:768},hasTouch:true});
    const tablet=await touch.newPage(); await tablet.goto('http://127.0.0.1:5194/layout-qa'); await tablet.locator('.home-page h1').waitFor();
    check(await tablet.evaluate(()=>matchMedia('(pointer: coarse)').matches),'Coarse pointer missing');
    check(await tablet.locator('.home-deadline-task').evaluateAll(items=>items.every(e=>e.getBoundingClientRect().height>=43.9)),'Tablet touch row too small');
    await touch.close();
    return {languages:['ru','en'],wiki:'stable identity + return',bookmarks:'130 records paging + viewer reading',search:'75 records continuation',coarseTablet:true,productionWrites:0};
  } finally {
    await page.evaluate(()=>{const {S,go}=window.__smena; const original=window.__r14Backup; S.data=original.data;S.prefs=original.prefs;S.ui.currentUser.role=original.role;S.ui.knowledgeDrawer=null;S.ui.knowledgeWikiTrail=[];S.ui.searchQ='';S.ui.bookmarkQuery='';S.ui.searchCat='all';go('home');delete window.__r14Backup;});
  }
}
