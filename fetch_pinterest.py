import urllib.request
import re
import ssl

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

url = "https://co.pinterest.com/pin/346495765052235810/"
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
try:
    html = urllib.request.urlopen(req, context=ctx).read().decode('utf-8')
    match = re.search(r'<meta property="og:image" name="og:image" content="([^"]+)"', html)
    if not match:
        match = re.search(r'<meta property="og:image" content="([^"]+)"', html)
        
    if match:
        img_url = match.group(1)
        print(f"Found image: {img_url}")
        img_req = urllib.request.Request(img_url, headers={'User-Agent': 'Mozilla/5.0'})
        img_data = urllib.request.urlopen(img_req, context=ctx).read()
        with open("table-1.jpg", "wb") as f:
            f.write(img_data)
        print("Done")
    else:
        print("Image not found in Pinterest HTML")
except Exception as e:
    print(f"Error: {e}")
