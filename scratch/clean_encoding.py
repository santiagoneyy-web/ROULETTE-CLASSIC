import os

def clean_file(path):
    with open(path, 'rb') as f:
        content = f.read()
    
    # Common corruptions to fix
    # Known literal string corruptions from previous sessions
    literal_replacements = [
        ('o" HIT', '✔ HIT'),
        ('âœ"', '✔'),
        ('â†º', '↺'),
        ('â†»', '↻'),
        ('â–¼', '▼'),
        ('â–²', '▲'),
        ('Ã³', 'ó'),
        ('Ã¡', 'á'),
        ('Ã©', 'é'),
        ('Ã', 'í'),
        ('Ã±', 'ñ'),
        ('Ãº', 'ú'),
        ('â”€', '—'),
        ('Â±', '±'),
        ('s? TRANSICI"N', '🟡 TRANSICIÓN'),
        ('o. ESTABLE', '🟢 ESTABLE'),
        ('YY ', '⚠️ '),
        ('tiradas aǧn', 'tiradas aún'),
        ('Dom', 'Dom.'),
        ('S"LIDA', 'SÓLIDA'),
        ('dur', 'duró'),
    ]
    
    # Try to decode as utf-8 and replace, then encode back
    try:
        text = content.decode('utf-8')
        for old, new in literal_replacements:
            text = text.replace(old, new)
        content = text.encode('utf-8')
    except:
        pass
        
    with open(path, 'wb') as f:
        f.write(content)

if __name__ == "__main__":
    clean_file("app.js")
    clean_file("index.html")
    print("Files cleaned.")
