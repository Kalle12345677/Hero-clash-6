# Hero Clash

Mobiles Browser-Arena-Spiel mit Konten, gespeicherten Profilen, Freundschaftsanfragen und Live-1-gegen-1-Kämpfen.

## Funktionen

- Konto erstellen und anmelden mit Benutzername oder E-Mail und Passwort
- Vorhandene lokale Demo-Profile beim Erstellen eines Kontos optional übernehmen
- Passwort-Hashes mit bcrypt; Login-Sitzungen über sichere HttpOnly-Cookies
- Profile und Fortschritt in PostgreSQL
- Freunde über den Benutzernamen hinzufügen, Anfragen annehmen und Online-Status sehen
- Online-Freunde in drei 1-gegen-1-Modi herausfordern: Kurzduell, Standard und Ausdauer
- Serverseitig geprüfte Bewegung, Deckung, Treffer, Ausweichen, Nachladen, kritische Treffer und Lebenspunkte
- Solo-Runden in drei Arenen mit kollidierender Deckung, drei Gegnerwellen und einem Boss
- Nahkampf- und Fernkampfwaffen mit Cooldown, Magazinen, Reserve-Munition, Nachladen, Zielkegel und Flächenschaden
- Gegner lassen unterschiedliche Münzbeträge fallen, die während der Runde eingesammelt werden
- Rüstungsstiefel erhöhen Bewegung und Ausweichweite; kosmetische Schuhe geben keine Werte
- Bestenliste aller Konten ohne Anzeige von E-Mail-Adressen
- Update-Hinweise pro Konto beim ersten Login nach einer neuen Ankündigung
- Offline-Solo mit lokalem Spielstand; nicht synchronisierte Änderungen werden beim nächsten Online-Login auf den Server übertragen

## Lokal starten

Benötigt Node.js ab 20.12 sowie eine erreichbare PostgreSQL-Datenbank.

1. `npm install`
2. `DATABASE_URL` auf die PostgreSQL-Verbindungsadresse setzen.
3. `JWT_SECRET` auf einen zufälligen, geheimen Wert mit mindestens 32 Bytes setzen.
4. `npm start`
5. Die Seite unter `http://localhost:10000` öffnen.

Die Datenbanktabellen werden beim Start automatisch angelegt. Für lokale Tests können die Variablen in einer nicht eingecheckten `.env`-Datei stehen.

## Auf Netlify veröffentlichen

1. Lade die Projektdateien in ein GitHub-Repository hoch. In der obersten Ebene liegen `index.html`, `app.js`, `styles.css`, `sw.js`, `server.js`, `package.json`, `package-lock.json` und `netlify.toml`. Übernimm auch die Ordner `netlify/` und `scripts/` mit ihrem Inhalt. Falls du das Upload-ZIP verwendest, entpacke es vor dem Hochladen. Eine persönliche `.env` bleibt auf deinem Rechner.
2. Wähle in Netlify **Add new project → Import an existing project → GitHub** und dann das Repository. Verwende ein Team mit einem Credit-Tarif. Falls du das Repository bereits mit Netlify verbunden hast, öffne das bestehende Projekt.
3. Die Konfiguration im Repository setzt Node.js 24, den Build-Befehl `npm run build` und das Publish-Verzeichnis `dist`. Das Base directory bleibt bei einem Repository mit dieser Ordnerstruktur leer.
4. Lege unter **Environment variables** den Schlüssel `JWT_SECRET` an. Für den Wert kannst du diese Befehle in **Windows PowerShell auf deinem PC** ausführen. Sie kopieren einen zufälligen Schlüssel in die Zwischenablage. Füge ihn in das Value-Feld ein. Wenn Netlify nach dem Scope fragt, wähle **Functions** oder **All scopes**. Behalte denselben Schlüssel für weitere Deploys, damit die Logins gültig bleiben.

   ```powershell
   $secretBytes = New-Object byte[] 48
   $generator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
   $generator.GetBytes($secretBytes)
   $generator.Dispose()
   [Convert]::ToBase64String($secretBytes) | Set-Clipboard
   ```

5. Starte den Deploy. Netlify richtet PostgreSQL ein, stellt dem Spielserver die Verbindung bereit und legt über die SQL-Migration Konten, Freundschaften und Update-Meldungen an. Wenn du den Schlüssel erst nach dem ersten Deploy eingetragen hast, starte unter **Deploys** einen neuen Deploy.
6. Öffne die veröffentlichte Spieladresse. Unter `/healthz` zeigt `{"ok":true}`, dass der Server die Kontentabelle lesen kann. Für ein Duell öffnen zwei Spieler dieselbe Spieladresse, registrieren je ein Konto und nehmen unter **Freunde** die Freundschaftsanfrage und dann die Duelleinladung an.

Der Spielserver läuft in Frankfurt mit maximal einer Instanz, damit beide Teilnehmer denselben Duellraum sehen. Ein Serverneustart während eines Duells kann die aktuelle Runde beenden. Gespeicherte Profile liegen unabhängig davon in PostgreSQL. Eine neue Netlify-Datenbank beginnt mit leeren Konten. Für die Übernahme von Konten aus einer früheren Installation wäre ein separater Datenimport nötig.

Mehr zur [Serverkonfiguration](https://docs.netlify.com/build/server/configuration/) und zur [automatischen Einrichtung der Datenbank](https://docs.netlify.com/build/data-and-storage/netlify-database/getting-started/).

### Steuerung und Offline-Spiel

Auf Handy und iPad bewegst du dich mit dem linken Joystick. Ziehe den rechten Joystick zum Zielen und lass ihn zum Angreifen los. Am Computer bewegst du dich mit WASD oder den Pfeiltasten, zielst mit der Maus und greifst per Klick oder Leertaste an. Mit R lädst du nach, mit Umschalt weichst du aus.

Öffne die Website einmal online und melde dich an, damit der Browser die Spieldateien und dein Profil lokal speichern kann. Das funktioniert auf einer HTTPS-Adresse oder lokal auf `localhost`. Solo-Fortschritt wird bei wiederhergestellter Verbindung mit demselben Konto synchronisiert. Spiele die laufende Solo-Runde zu Ende, wenn die Verbindung währenddessen zurückkehrt.

## Render bereitstellen

Das Projekt braucht einen **Render Web Service**, keine Static Site: der Node-Server stellt die Website bereit und hält die WebSocket-Verbindungen für Freunde und Kämpfe offen. Zusätzlich eine Render-PostgreSQL-Datenbank anlegen.

- Runtime: **Node**
- Build Command: `npm install`
- Start Command: `npm start`
- Health Check Path: `/healthz`
- `DATABASE_URL`: Internal Database URL der Render-Datenbank
- `JWT_SECRET`: zufälliger geheimer Wert, mindestens 32 Bytes
- `NODE_ENV`: `production`

`PORT` setzt Render automatisch. Zugangsdaten als Environment Variables in Render hinterlegen und nicht in Git committen. Der Dienst muss zunächst mit einer Instanz laufen, da Online-Status und laufende 1-gegen-1-Räume im Arbeitsspeicher dieser Instanz verwaltet werden. Für mehrere Instanzen wäre ein gemeinsamer Socket.IO-Adapter erforderlich.

Render-Dokumentation: [Web Services](https://render.com/docs/web-services), [WebSockets](https://render.com/docs/websocket), [PostgreSQL](https://render.com/docs/postgresql-creating-connecting).

## Grenzen des aktuellen Multiplayer-Prototyps

- 1-gegen-1 startet per Einladung eines bereits hinzugefügten Freundes; zufällige Gegnersuche gibt es noch nicht.
- Kämpfe laufen in einer Server-Instanz. Bei Verbindungsabbruch wird die Runde beendet.
- E-Mail-Adressen werden gespeichert, aber es gibt noch keine E-Mail-Verifikation oder Passwort-zurücksetzen-Funktion.
- Die 1-gegen-1-Runde vergibt noch keine Belohnungen.
- Offline ist Solo verfügbar. Freundesduelle, Bestenliste und Ankündigungen benötigen eine Verbindung. Bei parallelen Änderungen auf mehreren Geräten werden Fortschrittswerte und freigeschaltete Gegenstände zusammengeführt. Bei gleichzeitig geänderter Ausrüstung oder Anzeige übernimmt das Spiel die Einstellungen vom synchronisierenden Gerät.
- Fortschritt und Shop-Käufe sind noch nicht vollständig serverseitig gegen Manipulation abgesichert; 1-gegen-1 ist daher zunächst für private Freundesduelle gedacht.
