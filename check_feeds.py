"""Free, scheduled public RSS checker. Does not post comments or likes."""
import json, os, re, html, urllib.request, urllib.parse, xml.etree.ElementTree as ET
from datetime import datetime
from zoneinfo import ZoneInfo
from pathlib import Path
from urllib.parse import urlparse

ROOT=Path(__file__).resolve().parent
STATE=ROOT/'data'/'seen.json'
FEEDS=ROOT/'data'/'feeds.json'
KST=ZoneInfo('Asia/Seoul')

def allowed(now):
    local=now.astimezone(KST)
    return 8 <= local.hour < 23 and local.minute in (0,30)

def fetch(blog_id):
    if not re.fullmatch(r'[a-zA-Z0-9_-]{5,20}',blog_id):
        raise ValueError('Invalid blog ID')
    req=urllib.request.Request(f'https://rss.blog.naver.com/{blog_id}.xml',headers={'User-Agent':'BlogMateAI-RSS/0.6'})
    with urllib.request.urlopen(req,timeout=20) as res:
        data=res.read(2_000_001)
    if len(data)>2_000_000: raise ValueError('RSS too large')
    root=ET.fromstring(data)
    items=[]
    for item in root.findall('./channel/item')[:30]:
        url=(item.findtext('link') or '').strip()
        parsed=urlparse(url)
        if parsed.scheme!='https' or parsed.hostname not in ('blog.naver.com','m.blog.naver.com'): continue
        title=html.unescape((item.findtext('title') or '').strip())[:250]
        guid=(item.findtext('guid') or url).strip()
        items.append({'id':blog_id+':'+guid,'blog_id':blog_id,'title':title,'url':url})
    return items

def main():
    ids=json.loads(FEEDS.read_text(encoding='utf-8'))
    state=json.loads(STATE.read_text(encoding='utf-8')) if STATE.exists() else {'initialized':{},'seen':[]}
    seen=set(state.get('seen',[]))
    new=[]; errors=[]; recent=[]
    for blog_id in ids:
        try:
            posts=fetch(blog_id)
            recent.extend(posts)
            if not state.get('initialized',{}).get(blog_id):
                state.setdefault('initialized',{})[blog_id]=True
                seen.update(p['id'] for p in posts)
                print(f'{blog_id}: initial baseline {len(posts)} posts (no notification)')
                continue
            for p in posts:
                if p['id'] not in seen: new.append(p)
                seen.add(p['id'])
        except Exception as e:
            errors.append(f'{blog_id}: {type(e).__name__}: {e}')
    state['seen']=sorted(seen)[-20000:]
    STATE.parent.mkdir(parents=True,exist_ok=True)
    STATE.write_text(json.dumps(state,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    output=ROOT/'docs'/'latest.json'
    output.write_text(json.dumps({'checked_at':now.isoformat(),'new_posts':new,'posts':recent[:200],'errors':errors},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(f'New posts: {len(new)}; errors: {len(errors)}')
    for p in new: print(p['title'],p['url'])
    for e in errors: print('WARNING',e)
    if new:
        notify_fcm(new)


def notify_fcm(posts):
    """Firebase Admin sends data messages to opted-in anonymous users."""
    credentials_json=os.getenv('FIREBASE_SERVICE_ACCOUNT_JSON','')
    if not credentials_json:
        print('FCM not configured; skip notifications')
        return
    import firebase_admin
    from firebase_admin import credentials, firestore, messaging
    app=firebase_admin.initialize_app(credentials.Certificate(json.loads(credentials_json)))
    db=firestore.client(app)
    subscribers=db.collection('subscriptions').stream()
    for subscriber in subscribers:
        entry=subscriber.to_dict() or {}
        token=entry.get('token')
        if not isinstance(token,str) or not token: continue
        # Notification contains only a count; URLs and titles are fetched from the public PWA.
        message=messaging.Message(token=token,data={'kind':'new_posts','count':str(len(posts))},webpush=messaging.WebpushConfig(headers={'TTL':'3600'}))
        try:
            messaging.send(message,app=app)
            print('FCM sent for subscription',subscriber.id[:6])
        except messaging.UnregisteredError:
            subscriber.reference.delete()
        except Exception as e:
            print('FCM failed:',type(e).__name__)

if __name__=='__main__': main()
