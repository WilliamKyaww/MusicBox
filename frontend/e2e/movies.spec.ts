import { test, expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { mockLibrary } from './fixtures'

const clip = readFileSync(new URL('./fixtures/movie.webm', import.meta.url))
const baseMovie = { id:'local:movie:test',kind:'movie',title:'The Quiet Horizon',description:'An original test film about a quiet evening by the sea.',
  date:'2026-01-01',runtime:1,poster:'/test-art/track000000.svg',backdrop:'/test-art/banner3.svg',genres:['Drama'],rating:7.5,cast:['Test Performer'],crew:['Test Director'],
  seasons:[],trailer_url:null,provider_url:null,certification:'Not rated',available_providers:[],playable:true,
  assets:[{id:'asset-1',label:'90p',height:90,video_codec:'vp8',audio_codec:'vorbis',duration:30,available:true}] }

async function mockMovies(page: Page, initial = true) {
  await mockLibrary(page)
  let enabled = initial
  let fail = false
  let saved = false
  let position = 0
  let sequence = 0
  let session = 0
  let profileCount = 1
  let registered = true
  const writes: { position: number; sequence: number }[] = []
  const profiles = [{ id:'default',name:'Local profile',local_default:1 }]
  const movie = () => ({ ...baseMovie,playable:registered,assets:registered ? baseMovie.assets : [] })
  await page.route(url => url.pathname.startsWith('/api/movies/'), async route => {
    const request=route.request(), url=new URL(request.url()), path=decodeURIComponent(url.pathname.replace('/api/movies',''))
    const method=request.method()
    const send=(json:unknown,status=200) => route.fulfill({status,json})
    if (path==='/status') return send(fail ? {detail:'Unavailable'} : {enabled,stage:'local',catalogue_available:enabled,playback_available:enabled,metadata_configured:true,media_configured:true,local_access:true,schema_version:2},fail ? 503 : 200)
    if (['POST','PUT','DELETE'].includes(method)) expect(request.headers()['x-musicbox-movies']).toBe('1')
    if (path==='/profiles') {
      if (method==='POST') profiles.push({id:'profile-'+profileCount++,name:request.postDataJSON().name,local_default:0})
      return send(method==='POST' ? profiles.at(-1) : profiles)
    }
    if (path.startsWith('/profiles/') && method==='DELETE' && !path.includes('history')) { const index=profiles.findIndex(p=>p.id===path.split('/')[2]); profiles.splice(index,1); return route.fulfill({status:204}) }
    if (path==='/genres') return send([{id:18,name:'Drama'}])
    if (path==='/catalogue') return send({items:url.searchParams.get('q')==='missing' ? [] : [movie()],page:1,total_pages:1,source:'tmdb'})
    if (path.endsWith('/recommendations')) return send([])
    if (path==='/titles/'+baseMovie.id) return send(movie())
    if (path.endsWith('/titles/'+baseMovie.id)) return send({saved:path.includes('/default/') && saved,progress:position ? {position,duration:30,completed:false,updated_at:1} : null})
    if (path.includes('/watchlist/')) { saved=request.postDataJSON().saved; return send({saved}) }
    if (path.endsWith('/watchlist')) return send(path.includes('/default/') && saved ? [movie()] : [])
    if (path.endsWith('/history')) { if (method==='DELETE') { position=0; return route.fulfill({status:204}) } return send(position ? [{...movie(),progress:{position,duration:30,completed:position>=29,updated_at:1}}] : []) }
    if (path.includes('/playback/')) { sequence=0; return send({session_id:'session-'+ ++session,title:movie(),asset_id:'asset-1',url:'/api/movies/assets/asset-1/file',duration:30,resume:position,subtitles:[]}) }
    if (path.includes('/progress/')) { const body=request.postDataJSON(); const accepted=body.sequence>sequence && body.session_id==='session-'+session; if(accepted){ sequence=body.sequence;position=body.position;writes.push(body) } return send({accepted}) }
    if (path==='/library') { const body=request.postDataJSON(); if(body.relative_path.includes('..')) return send({detail:'Choose a relative file inside the configured Movies folder.'},422); registered=true;return send(movie(),201) }
    if (path==='/assets/asset-1' && method==='DELETE') {registered=false;return route.fulfill({status:204})}
    if (path==='/assets/asset-1/file') {
      const range=/bytes=(\d+)-(\d*)/.exec(request.headers().range || '')
      const start=range ? Number(range[1]) : 0,end=range?.[2] ? Math.min(Number(range[2]),clip.length-1) : clip.length-1
      return route.fulfill({status:range?206:200,headers:{'Content-Type':'video/webm','Accept-Ranges':'bytes',...(range?{'Content-Range':`bytes ${start}-${end}/${clip.length}`}:{})},body:clip.subarray(start,end+1)})
    }
    return send({detail:'No Movies fixture for '+path},404)
  })
  await page.route(url=>url.pathname==='/api/settings',async route=>{
    if(route.request().method()==='PUT') enabled=route.request().postDataJSON().values.MOVIES_ENABLED
    await route.fulfill({json:{config_file:'test.env',read_only_reason:null,groups:[{id:'movies',label:'Movies'}],fields:[{key:'MOVIES_ENABLED',label:'Movies experience',group:'movies',kind:'boolean',description:'Movies',restart_required:false,minimum:null,maximum:null,is_set:true,value:enabled,locked:false}]}})
  })
  return {fail:(value:boolean)=>{fail=value},writes,getPosition:()=>position}
}

test('Movies can be enabled and disabled from Settings without losing existing navigation',async({page})=>{
  await mockMovies(page,false)
  await page.goto('/#/movies')
  await expect(page.getByRole('heading',{name:'Enable Movies'})).toBeVisible()
  await page.getByRole('link',{name:'Open settings',exact:true}).click()
  await page.getByRole('switch',{name:'Movies experience'}).click()
  await page.getByRole('link',{name:'Movies home'}).click()
  await expect(page.locator('.movies-feature')).toContainText('The Quiet Horizon')
  await page.locator('.app-controls').getByRole('link',{name:'Settings',exact:true}).click()
  await page.getByRole('switch',{name:'Movies experience'}).click()
  await page.getByRole('button',{name:'Video',exact:true}).click()
  await expect(page.locator('.yt-topbar')).toBeVisible()
  await expect(page.getByRole('button',{name:'Movies',exact:true})).toHaveCount(0)
})

test('catalogue, search, details, My List and local profiles use real actions',async({page})=>{
  await mockMovies(page)
  await page.goto('/#/movies')
  await expect(page.getByRole('heading',{name:'Popular TV'})).toBeVisible()
  await page.getByRole('searchbox',{name:'Search movies and TV'}).fill('Horizon')
  await page.getByRole('button',{name:'Search',exact:true}).click()
  await expect(page.getByRole('heading',{name:'Search Results'})).toBeVisible()
  await page.getByRole('link',{name:'Details for The Quiet Horizon'}).click()
  await page.getByRole('button',{name:'Add to my list'}).click()
  await expect(page.getByRole('button',{name:'Remove from my list'})).toBeEnabled()
  await page.getByRole('navigation',{name:'Movies navigation'}).getByRole('link',{name:'My list'}).click()
  await expect(page.getByRole('link',{name:'Details for The Quiet Horizon'})).toBeVisible()
  await page.getByRole('link',{name:'Manage profiles'}).click()
  await page.getByRole('textbox',{name:'New profile name'}).fill('Guest')
  await page.getByRole('button',{name:'Create profile'}).click()
  await expect(page.getByRole('combobox',{name:'Movies profile'})).toContainText('Guest')
  await page.getByRole('combobox',{name:'Movies profile'}).selectOption({label:'Guest'})
  await page.getByRole('navigation',{name:'Movies navigation'}).getByRole('link',{name:'My list'}).click()
  await expect(page.getByRole('heading',{name:'Nothing Here Yet'})).toBeVisible()
})

test('movie playback pauses music, seeks, saves progress and resumes after returning',async({page})=>{
  const fixture=await mockMovies(page)
  await page.goto('/#/music/playlist?id=night-drive')
  await page.getByRole('button',{name:'Play Night drive',exact:true}).click()
  const audio=page.locator('.audio-player audio')
  await expect.poll(()=>audio.evaluate((a:HTMLAudioElement)=>a.currentTime)).toBeGreaterThan(.2)
  await page.getByRole('button',{name:'Movies',exact:true}).click()
  await expect.poll(()=>audio.evaluate((a:HTMLAudioElement)=>a.paused)).toBe(false)
  await page.locator('.movies-feature').getByRole('link',{name:'Play now'}).click()
  const video=page.locator('.movies-player-frame video')
  await expect.poll(()=>video.evaluate((v:HTMLVideoElement)=>v.currentTime)).toBeGreaterThan(.2)
  await expect.poll(()=>audio.evaluate((a:HTMLAudioElement)=>a.paused)).toBe(true)
  await video.evaluate((v:HTMLVideoElement)=>{v.currentTime=12;v.pause()})
  await expect.poll(()=>fixture.getPosition()).toBeGreaterThan(11)
  await page.getByRole('link',{name:'Back to title'}).click()
  await page.getByRole('link',{name:'Resume',exact:true}).click()
  await expect.poll(()=>video.evaluate((v:HTMLVideoElement)=>v.currentTime)).toBeGreaterThan(11)
  await page.getByRole('button',{name:'Start over'}).click()
  await expect.poll(()=>video.evaluate((v:HTMLVideoElement)=>v.currentTime)).toBeLessThan(3)
  expect(fixture.writes.length).toBeGreaterThan(0)
  await page.getByRole('button',{name:'Music',exact:true}).click()
  await expect(audio).toHaveCount(1)
  await expect(page.locator('.movies-player-frame')).toHaveCount(0)
})

test('local registration validates rights and missing paths; unregister leaves an honest details-only title',async({page})=>{
  await mockMovies(page)
  await page.goto('/#/movies/library')
  await page.getByRole('textbox',{name:'Title',exact:true}).fill('My Film')
  await page.getByRole('textbox',{name:'Relative file path'}).fill('../outside.mp4')
  await page.getByRole('checkbox').check()
  await page.getByRole('button',{name:'Register file',exact:true}).click()
  await expect(page.getByRole('alert')).toContainText('inside the configured Movies folder')
  await page.getByRole('textbox',{name:'Relative file path'}).fill('Films/My Film.mp4')
  await page.getByRole('button',{name:'Register file',exact:true}).click()
  await expect(page).toHaveURL(/movies\/details/)
  page.on('dialog',dialog=>dialog.accept())
  await page.getByRole('button',{name:'Unregister',exact:true}).click()
  await expect(page.getByText('Details only. Register an authorised file below to watch here.')).toBeVisible()
  await expect(page.getByRole('link',{name:'Play',exact:true})).toHaveCount(0)
})

test('Movies outage and unknown routes do not break Video or Music',async({page})=>{
  const fixture=await mockMovies(page)
  fixture.fail(true)
  await page.goto('/#/movies')
  await expect(page.getByRole('alert')).toContainText('Movies service could not be reached')
  fixture.fail(false)
  await page.getByRole('button',{name:'Try again',exact:true}).click()
  await expect(page.locator('.movies-feature')).toBeVisible()
  await page.goto('/#/movies/watch?v=not-youtube')
  await expect(page.getByRole('heading',{name:'Page Not Available'})).toBeVisible()
  await page.getByRole('button',{name:'Video',exact:true}).click()
  await expect(page.locator('.yt-topbar')).toBeVisible()
})

test('an unexpected Movies render failure leaves Video accessible',async({page})=>{
  await mockMovies(page)
  await page.route(url=>url.pathname==='/api/movies/catalogue',route=>route.fulfill({json:{items:null,page:1,total_pages:1}}))
  await page.goto('/#/movies/home')
  await expect(page.getByRole('heading',{name:'Movies Could Not Be Displayed'})).toBeVisible()
  await page.getByRole('link',{name:'Return to Video'}).click()
  await expect(page.locator('.yt-topbar')).toBeVisible()
})

for(const width of [1440,1024,390]) for(const theme of ['light','dark']) {
  test(`Movies layouts ${width}px ${theme}`,async({page},testInfo)=>{
    await mockMovies(page)
    await page.setViewportSize({width,height:900})
    await page.emulateMedia({reducedMotion:'reduce'})
    await page.addInitScript(value=>localStorage.setItem('spotimy-theme',value),theme)
    for(const view of ['home','details?id=local%3Amovie%3Atest','library']) {
      await page.goto('/#/movies/'+view)
      await expect(page.locator('.movies-secondary')).toBeVisible()
      await expect(page.getByRole('heading',{name:'Credits and Availability'})).toBeVisible()
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
      await page.screenshot({path:testInfo.outputPath(view.split('?')[0]+'.png'),fullPage:true})
      await page.evaluate(()=>window.scrollTo(0,600))
      expect((await page.locator('.movies-header').boundingBox())?.y).toBe(0)
    }
  })
}
