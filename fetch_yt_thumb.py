import urllib.request
import re
import ssl
import time

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

def fetch_yt_thumb(query, filename):
    url = f"https://www.youtube.com/results?search_query={urllib.parse.quote(query)}"
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    try:
        html = urllib.request.urlopen(req, context=ctx).read().decode('utf-8')
        match = re.search(r'"videoId":"([^"]{11})"', html)
        if match:
            vid = match.group(1)
            img_url = f"https://i.ytimg.com/vi/{vid}/maxresdefault.jpg"
            print(f"Downloading {img_url} to {filename}")
            img_req = urllib.request.Request(img_url, headers={'User-Agent': 'Mozilla/5.0'})
            try:
                img_data = urllib.request.urlopen(img_req, context=ctx).read()
                with open(filename, 'wb') as f:
                    f.write(img_data)
                return True
            except:
                print("maxres failed, trying hqdefault")
                img_url = f"https://i.ytimg.com/vi/{vid}/hqdefault.jpg"
                img_req = urllib.request.Request(img_url, headers={'User-Agent': 'Mozilla/5.0'})
                img_data = urllib.request.urlopen(img_req, context=ctx).read()
                with open(filename, 'wb') as f:
                    f.write(img_data)
                return True
    except Exception as e:
        print(f"Error {filename}: {e}")
    return False

# For Auto Roulette, it's usually automatic without a dealer
fetch_yt_thumb("Evolution Auto Roulette gameplay -immersive -lightning", "table-1.jpg")
time.sleep(1)
# For Immersive Roulette, it has a dealer and slow motion cameras
fetch_yt_thumb("Evolution Immersive Roulette live dealer -auto -lightning", "table-2.jpg")
