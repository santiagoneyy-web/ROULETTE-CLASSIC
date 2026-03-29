import urllib.request
import re
import ssl

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

def download_ddg_image(query, filename):
    url = f"https://html.duckduckgo.com/html/?q={urllib.parse.quote(query)}"
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    try:
        html = urllib.request.urlopen(req, context=ctx).read().decode('utf-8')
        # find img src
        match = re.search(r'img class="tile--img__img".*?src="([^"]+)"', html)
        if match:
            img_url = match.group(1)
            if img_url.startswith('//'):
                img_url = 'https:' + img_url
            print(f"Downloading {img_url} to {filename}")
            img_req = urllib.request.Request(img_url, headers={'User-Agent': 'Mozilla/5.0'})
            img_data = urllib.request.urlopen(img_req, context=ctx).read()
            with open(filename, 'wb') as f:
                f.write(img_data)
            return True
        else:
            print(f"No image found for {query}")
    except Exception as e:
        print(f"Error: {e}")
    return False

download_ddg_image("Evolution Gaming Roulette Live table thumbnail", "public/table-auto.jpg")
download_ddg_image("Evolution Gaming Immersive Roulette table dealer", "public/table-immersive.jpg")
