with open(r"c:\Users\ramul\Downloads\portal-fazenda-da-família\sitefazendasaobento\pages\Supplies.tsx", "r", encoding="utf-8") as f:
    lines = f.readlines()

for idx, line in enumerate(lines):
    if "import" in line.lower() or "excel" in line.lower() or "csv" in line.lower() or "xlsx" in line.lower() or "planilha" in line.lower():
        if "export" not in line.lower():
            print(f"Line {idx+1}: {line.strip()}")
