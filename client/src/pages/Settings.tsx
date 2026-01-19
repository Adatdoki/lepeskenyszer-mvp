import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { ArrowLeft, FileSpreadsheet, RefreshCcw, Upload } from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";
import * as XLSX from 'xlsx';

export default function Settings() {
  const [fileName, setFileName] = useState<string | null>(localStorage.getItem('customDeckName'));

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        // Olvassuk be header nélkül, hogy indexekkel hivatkozhassunk az oszlopokra
        const data = XLSX.utils.sheet_to_json(ws, { header: 1 });

        // Az első sor a fejléc, azt kihagyjuk
        const rows = data.slice(1);

        // Validáció és átalakítás a generate_cards_universal.py logikája alapján
        const processedCards: any[] = [];
        
        // 1. Döntés a konfigurációról (Auto-detect)
        // A Python script ellenőrzi, hogy van-e "Személy" oszlop.
        // Itt a header sor (data[0]) alapján döntünk.
        const headerRow = data[0] as any[];
        const hasPersonColumn = headerRow.includes("Személy");

        if (hasPersonColumn) {
          // Történelmi kártyák (név alapú oszlopok)
          // Mapping: Személy, Helyszín, Esemény, Időpont
          // A Python script soronként generál 4 kártyát (egy sor = egy lánc)
          
          // Megkeressük az oszlopindexeket
          const colMap = {
            szemely: headerRow.indexOf("Személy"),
            helyszin: headerRow.indexOf("Helyszín"),
            esemeny: headerRow.indexOf("Esemény"),
            idopont: headerRow.indexOf("Időpont"),
            szemelyDesc: headerRow.indexOf("Személy magyarázat"),
            helyszinDesc: headerRow.indexOf("Helyszín magyarázat"),
            esemenyDesc: headerRow.indexOf("Esemény magyarázat"),
            idopontDesc: headerRow.indexOf("Időpont magyarázat"),
            lancId: headerRow.indexOf("Lánc") // Ha van ilyen, ha nincs, generálunk
          };

          rows.forEach((row: any, index: number) => {
            if (!row || row.length === 0) return;
            
            // Ha nincs Lánc ID, akkor a sorindex lesz az ID
            const chainId = (colMap.lancId !== -1 && row[colMap.lancId]) ? parseInt(row[colMap.lancId]) : index + 1;

            // 1. Kártya: SZEMÉLY
            if (colMap.szemely !== -1 && row[colMap.szemely]) {
              processedCards.push({
                id: `custom-${chainId}-1`,
                type: 'SZEMÉLY',
                title: row[colMap.szemely],
                description: (colMap.szemelyDesc !== -1 && row[colMap.szemelyDesc]) ? row[colMap.szemelyDesc] : "Személy",
                chainId: chainId
              });
            }

            // 2. Kártya: HELYSZÍN
            if (colMap.helyszin !== -1 && row[colMap.helyszin]) {
              processedCards.push({
                id: `custom-${chainId}-2`,
                type: 'HELYSZÍN',
                title: row[colMap.helyszin],
                description: (colMap.helyszinDesc !== -1 && row[colMap.helyszinDesc]) ? row[colMap.helyszinDesc] : "Helyszín",
                chainId: chainId
              });
            }

            // 3. Kártya: ESEMÉNY
            if (colMap.esemeny !== -1 && row[colMap.esemeny]) {
              processedCards.push({
                id: `custom-${chainId}-3`,
                type: 'ESEMÉNY',
                title: row[colMap.esemeny],
                description: (colMap.esemenyDesc !== -1 && row[colMap.esemenyDesc]) ? row[colMap.esemenyDesc] : "Esemény",
                chainId: chainId
              });
            }

            // 4. Kártya: IDŐPONT
            if (colMap.idopont !== -1 && row[colMap.idopont]) {
              processedCards.push({
                id: `custom-${chainId}-4`,
                type: 'IDŐPONT',
                title: row[colMap.idopont],
                description: (colMap.idopontDesc !== -1 && row[colMap.idopontDesc]) ? row[colMap.idopontDesc] : "Időpont",
                chainId: chainId
              });
            }
          });

        } else {
          // Matek kártyák (index alapú oszlopok)
          // A Python script szerint: C, D, E, F oszlopok (index 2, 3, 4, 5)
          // A felhasználó kérése szerint: C, D, E, F, G (G = Lánc ID)
          // Itt egy sor = egy kártya. A láncokat a G oszlop (index 6) köti össze.
          
          // Csoportosítsuk láncok szerint
          const chains: Record<string, any[]> = {};
          
          rows.forEach((row: any, index: number) => {
            if (!row || row.length === 0) return;
            
            // G oszlop (index 6) a Lánc ID
            const chainId = row[6]; 
            if (!chainId) return;
            
            if (!chains[chainId]) chains[chainId] = [];
            chains[chainId].push(row);
          });

          // Minden lánchoz generáljunk kártyákat
          Object.entries(chains).forEach(([chainId, chainRows]) => {
            // A játékhoz 4 különböző típusú kártya kell egy láncba.
            // A típusokat ciklikusan osztjuk ki: SZEMÉLY, HELYSZÍN, ESEMÉNY, IDŐPONT
            const types = ['SZEMÉLY', 'HELYSZÍN', 'ESEMÉNY', 'IDŐPONT'];
            
            chainRows.forEach((row: any, idx: number) => {
              const type = types[idx % 4];
              
              // Adatok kinyerése (C, D, E, F oszlopok -> index 2, 3, 4, 5)
              const colC = row[2]; // Pl. 17
              const colD = row[3]; // Pl. *
              const colE = row[4]; // Pl. 15
              const colF = row[5]; // Pl. 255
              
              // Cím generálása: C oszlop tartalma (ha van)
              // A Python scriptben: title_text = row.iloc[col_idx]
              // Itt viszont 4 kártya van egy láncban, és a Python scriptben a 4 oszlop (C,D,E,F) felelt meg a 4 kártyának.
              // DE! A felhasználó azt írta: "Ebből a C D E F G oszlopokat használjuk a játékban"
              // És a Python scriptben: 
              // card_mapping = [{"col_idx": 2}, {"col_idx": 3}, {"col_idx": 4}, {"col_idx": 5}]
              // Ez azt jelenti, hogy EGY SORBÓL generálódik 4 kártya?
              // VAGY minden sor egy kártya?
              
              // A Python script `create_card_document` függvényében:
              // `table = doc.add_table(rows=0, cols=4)` -> 4 oszlopos táblázat (4 kártya egy sorban)
              // `for index, row in df.iterrows():` -> Végigmegy a sorokon
              // `for card_conf in card_mapping:` -> Belül végigmegy a 4 konfiguráción
              // Tehát: EGY SORBÓL lesz 4 kártya!
              
              // Javított logika a Python script alapján:
              // Minden sor egy teljes lánc (4 kártya).
              // 1. kártya: C oszlop (index 2)
              // 2. kártya: D oszlop (index 3)
              // 3. kártya: E oszlop (index 4)
              // 4. kártya: F oszlop (index 5)
              // Lánc ID: G oszlop (index 6) - ha van, ha nincs, akkor generálunk
            });
          });
          
          // ÚJRAÍRT LOGIKA (Matek - Soronként 4 kártya)
          rows.forEach((row: any, index: number) => {
             if (!row || row.length === 0) return;
             
             // Lánc ID: G oszlop (index 6) vagy sorindex
             const chainId = (row[6]) ? parseInt(row[6]) : index + 1;
             
             // 1. Kártya (C oszlop - index 2) -> SZEMÉLY
             if (row[2] !== undefined) {
               processedCards.push({
                 id: `custom-${chainId}-1`,
                 type: 'SZEMÉLY',
                 title: String(row[2]),
                 description: "Érték 1",
                 chainId: chainId
               });
             }
             
             // 2. Kártya (D oszlop - index 3) -> HELYSZÍN
             if (row[3] !== undefined) {
               processedCards.push({
                 id: `custom-${chainId}-2`,
                 type: 'HELYSZÍN',
                 title: String(row[3]),
                 description: "Művelet",
                 chainId: chainId
               });
             }
             
             // 3. Kártya (E oszlop - index 4) -> ESEMÉNY
             if (row[4] !== undefined) {
               processedCards.push({
                 id: `custom-${chainId}-3`,
                 type: 'ESEMÉNY',
                 title: String(row[4]),
                 description: "Érték 2",
                 chainId: chainId
               });
             }
             
             // 4. Kártya (F oszlop - index 5) -> IDŐPONT
             if (row[5] !== undefined) {
               processedCards.push({
                 id: `custom-${chainId}-4`,
                 type: 'IDŐPONT',
                 title: String(row[5]),
                 description: "Eredmény",
                 chainId: chainId
               });
             }
          });
        }

        if (processedCards.length < 10) {
          throw new Error("A fájl túl kevés kártyát tartalmaz (min. 10 db kell).");
        }

        // Mentés LocalStorage-ba
        localStorage.setItem('customDeck', JSON.stringify(processedCards));
        localStorage.setItem('customDeckName', file.name);
        setFileName(file.name);

        toast.success(`Sikeres feltöltés! ${processedCards.length} kártya betöltve.`);
      } catch (error) {
        console.error(error);
        toast.error("Hiba történt: Nem sikerült feldolgozni a fájlt. Ellenőrizd a formátumot!");
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleReset = () => {
    localStorage.removeItem('customDeck');
    localStorage.removeItem('customDeckName');
    setFileName(null);
    toast.success("Visszaállítás sikeres: Az alapértelmezett kártyapakli aktív.");
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 p-8 font-sans flex items-center justify-center">
      <Card className="w-full max-w-md bg-neutral-900 border-neutral-800">
        <CardHeader>
          <CardTitle className="text-2xl font-typewriter text-center text-neutral-200 flex items-center justify-center gap-2">
            <FileSpreadsheet className="w-6 h-6" />
            BEÁLLÍTÁSOK
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          
          <div className="space-y-2">
            <h3 className="font-bold text-sm text-neutral-400 uppercase tracking-wider">Kártyák forrása</h3>
            <div className="p-4 bg-neutral-950 rounded border border-neutral-800">
              {fileName ? (
                <div className="flex items-center justify-between">
                  <span className="text-green-500 font-typewriter text-sm truncate max-w-[200px]">{fileName}</span>
                  <span className="text-xs bg-green-900/30 text-green-400 px-2 py-1 rounded border border-green-800">EGYÉNI</span>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <span className="text-neutral-500 font-typewriter text-sm">Alapértelmezett pakli</span>
                  <span className="text-xs bg-neutral-800 text-neutral-400 px-2 py-1 rounded border border-neutral-700">GYÁRI</span>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <div className="relative">
              <Input 
                type="file" 
                accept=".xlsx, .xls" 
                onChange={handleFileUpload}
                className="hidden" 
                id="file-upload"
              />
              <label 
                htmlFor="file-upload"
                className="flex items-center justify-center gap-2 w-full p-3 bg-neutral-800 hover:bg-neutral-700 border border-neutral-600 rounded cursor-pointer transition-colors font-bold text-sm"
              >
                <Upload className="w-4 h-4" />
                XLSX Feltöltése
              </label>
            </div>

            <Button 
              onClick={handleReset} 
              variant="outline" 
              className="w-full border-red-900/50 text-red-400 hover:bg-red-950 hover:text-red-300"
              disabled={!fileName}
            >
              <RefreshCcw className="w-4 h-4 mr-2" />
              Visszaállítás alaphelyzetbe
            </Button>
          </div>

          <div className="pt-4 border-t border-neutral-800">
            <Link href="/">
              <Button variant="ghost" className="w-full text-neutral-400 hover:text-white">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Vissza a főmenübe
              </Button>
            </Link>
          </div>

        </CardContent>
      </Card>
    </div>
  );
}
