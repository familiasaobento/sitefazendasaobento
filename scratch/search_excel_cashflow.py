import os

def search_files(directory):
    results = []
    for root, dirs, files in os.walk(directory):
        for file in files:
            if file.endswith('.tsx'):
                filepath = os.path.join(root, file)
                try:
                    with open(filepath, 'r', encoding='utf-8') as f:
                        lines = f.readlines()
                    for idx, line in enumerate(lines):
                        if 'type="file"' in line or "type='file'" in line:
                            results.append(f"{file} Line {idx+1}: {line.strip()}")
                except Exception as e:
                    pass
    with open(r"c:\Users\ramul\Downloads\portal-fazenda-da-família\sitefazendasaobento\scratch\excel_results.txt", "w", encoding="utf-8") as out:
        out.write("\n".join(results))

search_files(r"c:\Users\ramul\Downloads\portal-fazenda-da-família\sitefazendasaobento\pages")
print("Done searching.")
