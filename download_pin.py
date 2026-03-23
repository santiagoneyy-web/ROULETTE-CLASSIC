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
    match = re.search(r'https://i\.pinimg\.com/(?:originals|736x|564x|[0-9xX]+)/[a-zA-Z0-9/_\-]+\.(?:jpg|png)', html)
    if match:
        img_url = match.group(0)
        print(f"Downloading: {img_url}")
        img_req = urllib.request.Request(img_url, headers={'User-Agent': 'Mozilla/5.0'})
        img_data = urllib.request.urlopen(img_req, context=ctx).read()
        with open("table-1.jpg", "wb") as f:
            f.write(img_data)
        print("Downloaded")
    else:
        print("Not found")
except Exception as e:
    print(f"Error: {e}")
