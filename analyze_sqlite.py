import sqlite3
import sys

db_path = "c:/Users/HP/.gemini/antigravity/playground/ROULETTE-CLASSIC/roulette.db"

def analyze():
    print("--- CONNECTING TO SQLITE ---")
    try:
        conn = sqlite3.connect(db_path)
        cur = conn.cursor()
        
        cur.execute("SELECT name FROM sqlite_master WHERE type='table';")
        tables = cur.fetchall()
        print("TABLES FOUND:", [t[0] for t in tables])
        
        for t in tables:
            t_name = t[0]
            cur.execute(f"SELECT COUNT(*) FROM [{t_name}];")
            count = cur.fetchone()[0]
            print(f"Table [{t_name}] has {count} rows.")
            
            if "spin" in t_name.lower() or "result" in t_name.lower() or "histor" in t_name.lower():
                cur.execute(f"SELECT * FROM [{t_name}] LIMIT 10")
                rows = cur.fetchall()
                if not rows: continue
                # Get column names
                col_names = [description[0] for description in cur.description]
                print(f"Columns in {t_name}:", col_names)
                
                # Fetch all rows for analysis
                cur.execute(f"SELECT * FROM [{t_name}]")
                all_rows = cur.fetchall()
                
                # Check if "number" column exists
                num_idx = -1
                if 'number' in col_names: num_idx = col_names.index('number')
                elif 'result' in col_names: num_idx = col_names.index('result')
                
                if num_idx == -1: continue
                
                numbers = [r[num_idx] for r in all_rows if r[num_idx] is not None]
                if not numbers:
                    print(f"No valid numbers in {t_name}.")
                    continue
                
                from collections import Counter
                counts = Counter(numbers)
                most_common = counts.most_common(10)
                least_common = counts.most_common()[-10:]
                least_common.reverse()
                
                print("\n--- HOT NUMBERS ---")
                print(" | ".join([f"#{n}: {c} times" for n,c in most_common]))
                
                print("\n--- COLD NUMBERS ---")
                print(" | ".join([f"#{n}: {c} times" for n,c in least_common]))
                
                # Repeats
                repeats = 0
                for i in range(1, len(numbers)):
                    if numbers[i] == numbers[i-1]:
                        repeats += 1
                print(f"\nTotal Back-to-Back Repeats in {len(numbers)} spins: {repeats}")
                
        conn.close()
    except Exception as e:
        print("Error:", e)

if __name__ == "__main__":
    analyze()
