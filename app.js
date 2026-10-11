(() => {
  // src/logic.mjs
  function eventDateTime(event, field = "start") {
    return `${event.date}T${event[field]}`;
  }
  function selectedWeather(weather, selectedDateTime) {
    var _a, _b, _c;
    if (!((_a = weather == null ? void 0 : weather.hourly) == null ? void 0 : _a.length)) return null;
    const target = new Date(selectedDateTime).getTime();
    return (_c = (_b = weather.hourly.reduce((best, row) => {
      const distance = Math.abs(new Date(row.time).getTime() - target);
      return !best || distance < best.distance ? { row, distance } : best;
    }, null)) == null ? void 0 : _b.row) != null ? _c : null;
  }
  function lastWetHour(weather, selectedDateTime) {
    var _a, _b;
    if (!((_a = weather == null ? void 0 : weather.hourly) == null ? void 0 : _a.length)) return null;
    const target = new Date(selectedDateTime).getTime();
    return (_b = weather.hourly.filter((row) => {
      var _a2;
      return new Date(row.time).getTime() <= target && ((_a2 = row.precipitation) != null ? _a2 : 0) > 0.1;
    }).sort((a, b) => new Date(b.time) - new Date(a.time))[0]) != null ? _b : null;
  }
  function hoursBetween(from, to) {
    return (new Date(to).getTime() - new Date(from).getTime()) / 36e5;
  }
  function findEventsInWindow(events, centerDateTime, { hockey, hours = 24 } = {}) {
    const center = new Date(centerDateTime).getTime();
    const radius = hours * 36e5;
    return events.filter((event) => !hockey || event.hockey === hockey).filter((event) => {
      const start = new Date(eventDateTime(event)).getTime();
      return start >= center - radius && start <= center + radius;
    }).sort((a, b) => eventDateTime(a).localeCompare(eventDateTime(b)));
  }
  function effectiveEventEnd(event, sunset) {
    if (event.hockey !== "roller" || !sunset || !sunset.startsWith(event.date)) return event.end;
    const sunsetTime = sunset.slice(11, 16);
    return sunsetTime < event.end ? sunsetTime : event.end;
  }
  function evaluateEvent({ event, venue, weather, sunset }) {
    var _a, _b, _c, _d, _e;
    const reasons = [];
    if (venue.surface === "indoor") {
      reasons.push({ code: "indoor", message: "Obiekt kryty \u2014 pogoda nie wp\u0142ywa na trening." });
      return { status: "yes", reasons, effectiveEnd: event.end };
    }
    const startDateTime = eventDateTime(event);
    const current = selectedWeather(weather, startDateTime);
    if (!current) {
      reasons.push({ code: "weather-missing", message: "Brak prognozy dla pocz\u0105tku tego terminu." });
      return { status: "unknown", reasons, effectiveEnd: event.end };
    }
    if (event.hockey === "roller") {
      const end = effectiveEventEnd(event, sunset);
      if (sunset && new Date(startDateTime).getTime() >= new Date(sunset).getTime()) {
        reasons.push({ code: "after-sunset", message: "Termin zaczyna si\u0119 po zachodzie s\u0142o\u0144ca." });
        return { status: "no", reasons, effectiveEnd: end };
      }
      if (((_a = current.precipitation) != null ? _a : 0) > 0.1) {
        reasons.push({ code: "rain-now", message: "Na pocz\u0105tku terminu prognozowane s\u0105 opady." });
        return { status: "no", reasons, effectiveEnd: end };
      }
      const previousWet = lastWetHour(weather, startDateTime);
      if (previousWet) {
        const heavy = ((_b = previousWet.precipitation) != null ? _b : 0) >= 5;
        const cloudy = ((_c = current.cloudCover) != null ? _c : 0) >= 70;
        const dryingHours = heavy || cloudy ? 12 : 4;
        if (hoursBetween(previousWet.time, startDateTime) < dryingHours) {
          reasons.push({ code: "surface-drying", message: `Nawierzchnia mo\u017Ce schn\u0105\u0107 przez ${dryingHours} godz. od ostatnich opad\xF3w.` });
          return { status: "no", reasons, effectiveEnd: end };
        }
      }
      if (((_d = current.temperature) != null ? _d : -Infinity) > 35) {
        reasons.push({ code: "heat-warning", message: "Temperatura przekracza 35\xB0C." });
        return { status: "warning", reasons, effectiveEnd: end };
      }
      if (end !== event.end) {
        reasons.push({ code: "daylight-limit", message: `Gra mo\u017Cliwa najp\xF3\u017Aniej do zachodu s\u0142o\u0144ca o ${end}.` });
        return { status: "warning", reasons, effectiveEnd: end };
      }
      reasons.push({ code: "weather-ok", message: "Na pocz\u0105tku terminu prognoza nie wskazuje opad\xF3w." });
      return { status: "yes", reasons, effectiveEnd: end };
    }
    const precipitation = (_e = current.precipitation) != null ? _e : 0;
    if (precipitation >= 4) {
      reasons.push({ code: "weather-block", message: "Na odkrytym lodowisku prognozowane s\u0105 obfite opady." });
      return { status: "no", reasons, effectiveEnd: event.end };
    }
    if (precipitation > 0.1) {
      reasons.push({ code: "light-precipitation", message: "Mo\u017Cliwe s\u0105 lekkie opady na odkrytym lodowisku." });
      return { status: "warning", reasons, effectiveEnd: event.end };
    }
    return { status: "yes", reasons: [{ code: "weather-ok", message: "Prognoza nie wskazuje istotnych opad\xF3w." }], effectiveEnd: event.end };
  }

  // src/weather.mjs
  function previousDate(date) {
    const [year, month, day] = date.split("-").map(Number);
    const value = new Date(Date.UTC(year, month - 1, day) - 24 * 60 * 60 * 1e3);
    return value.toISOString().slice(0, 10);
  }
  function buildOpenMeteoUrl({ latitude, longitude, date }) {
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.search = new URLSearchParams({
      latitude: String(latitude),
      longitude: String(longitude),
      hourly: "temperature_2m,precipitation,rain,snowfall,cloud_cover",
      daily: "sunset",
      timezone: "Europe/Warsaw",
      start_date: previousDate(date),
      end_date: date
    });
    return url.href;
  }
  function normalizeOpenMeteo(payload, selectedDate) {
    var _a, _b;
    if (!((_a = payload == null ? void 0 : payload.hourly) == null ? void 0 : _a.time) || !((_b = payload == null ? void 0 : payload.daily) == null ? void 0 : _b.time)) throw new Error("Open-Meteo zwr\xF3ci\u0142o niepe\u0142ne dane.");
    const hourly = payload.hourly.time.map((time, index) => ({
      time,
      temperature: payload.hourly.temperature_2m[index],
      precipitation: payload.hourly.precipitation[index],
      rain: payload.hourly.rain[index],
      snowfall: payload.hourly.snowfall[index],
      cloudCover: payload.hourly.cloud_cover[index]
    }));
    const sunsetIndex = payload.daily.time.indexOf(selectedDate);
    return {
      hourly,
      sunset: sunsetIndex >= 0 ? payload.daily.sunset[sunsetIndex] : null
    };
  }
  async function fetchOpenMeteo({ latitude, longitude, date, fetchImpl = fetch }) {
    const response = await fetchImpl(buildOpenMeteoUrl({ latitude, longitude, date }));
    if (!response.ok) throw new Error(`Open-Meteo: HTTP ${response.status}`);
    return normalizeOpenMeteo(await response.json(), date);
  }

  // src/schedule-csv.mjs
  var REQUIRED_COLUMNS = ["typ", "data", "godzina_start", "godzina_end", "miejsce", "organizator", "zapisy", "kontakt", "uwagi"];
  var HOCKEY = { "l\xF3d": "ice", rolki: "roller" };
  var VENUES = {
    Torwar: { name: "Torwar", surface: "indoor", latitude: null, longitude: null },
    Stegny: { name: "Stegny", surface: "outdoor", latitude: 52.1870946, longitude: 21.0434985 },
    Gubinowska: { name: "Gubinowska", surface: "indoor", latitude: null, longitude: null }
  };
  function parseRows(csvText) {
    const text = csvText.replace(/^\uFEFF/, "");
    const rows = [];
    let row = [];
    let field = "";
    let quoted = false;
    const finishField = () => {
      row.push(field.trim());
      field = "";
    };
    const finishRow = () => {
      finishField();
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
    };
    for (let index = 0; index < text.length; index += 1) {
      const character = text[index];
      if (quoted) {
        if (character === '"' && text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else if (character === '"') {
          quoted = false;
        } else {
          field += character;
        }
      } else if (character === '"' && field === "") {
        quoted = true;
      } else if (character === ",") {
        finishField();
      } else if (character === "\n") {
        finishRow();
      } else if (character !== "\r") {
        field += character;
      }
    }
    if (quoted) throw new Error("Nie zamkni\u0119to cudzys\u0142owu w pliku CSV.");
    if (field !== "" || row.length) finishRow();
    return rows;
  }
  function validDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [year, month, day] = value.split("-").map(Number);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
  }
  function validTime(value) {
    return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
  }
  function minuteOfDay(value) {
    const [hour, minute] = value.split(":").map(Number);
    return hour * 60 + minute;
  }
  function parseScheduleCsv(csvText) {
    const [header = [], ...rows] = parseRows(csvText);
    const missing = REQUIRED_COLUMNS.filter((column) => !header.includes(column));
    if (missing.length) throw new Error(`Brak wymaganych kolumn CSV: ${missing.join(", ")}`);
    if (header.length !== REQUIRED_COLUMNS.length || !header.every((column, index) => column === REQUIRED_COLUMNS[index])) {
      throw new Error(`Kolumny CSV musz\u0105 mie\u0107 kolejno\u015B\u0107: ${REQUIRED_COLUMNS.join(", ")}`);
    }
    const seen = /* @__PURE__ */ new Set();
    const events = rows.map((values, index) => {
      const number = index + 2;
      if (values.length !== header.length) throw new Error(`Wiersz ${number} ma nieprawid\u0142ow\u0105 liczb\u0119 kolumn.`);
      const row = Object.fromEntries(header.map((column, columnIndex) => [column, values[columnIndex]]));
      if (!HOCKEY[row.typ]) throw new Error(`Wiersz ${number}: nieznany typ hokeja \u201E${row.typ}\u201D.`);
      if (!validDate(row.data)) throw new Error(`Wiersz ${number}: niepoprawna data.`);
      if (!validTime(row.godzina_start) || !validTime(row.godzina_end)) throw new Error(`Wiersz ${number}: niepoprawna godzina.`);
      if (minuteOfDay(row.godzina_end) <= minuteOfDay(row.godzina_start)) throw new Error(`Wiersz ${number}: godzina_end musi by\u0107 p\xF3\u017Aniejsza ni\u017C godzina_start.`);
      if (!VENUES[row.miejsce]) throw new Error(`Wiersz ${number}: nieznane miejsce \u201E${row.miejsce}\u201D.`);
      if (!row.organizator) throw new Error(`Wiersz ${number}: brak organizatora.`);
      const uniqueKey = [row.typ, row.data, row.godzina_start, row.godzina_end, row.miejsce, row.organizator].join("|");
      if (seen.has(uniqueKey)) throw new Error(`Powt\xF3rzony trening w wierszu ${number}.`);
      seen.add(uniqueKey);
      return {
        id: `event-${String(index + 1).padStart(3, "0")}`,
        hockey: HOCKEY[row.typ],
        typeLabel: row.typ,
        date: row.data,
        start: row.godzina_start,
        end: row.godzina_end,
        venue: row.miejsce,
        organizer: row.organizator,
        registration: row.zapisy || "brak",
        contact: row.kontakt || "brak",
        notes: row.uwagi || "brak"
      };
    });
    events.sort((a, b) => `${a.date}T${a.start}`.localeCompare(`${b.date}T${b.start}`));
    return { version: 3, timezone: "Europe/Warsaw", venues: VENUES, events };
  }

  // src/app.mjs
  var EMBEDDED_SCHEDULE_CSV = "typ,data,godzina_start,godzina_end,miejsce,organizator,zapisy,kontakt,uwagi\nrolki,2026-10-11,08:30,20:00,Stegny,Samodzielnie,brak,brak,Samodzielne wej\u015Bcia na Tor Stegny\nl\xF3d,2026-10-11,22:00,23:15,Torwar,Warszawski Hokej,brak,https://www.facebook.com/warszawskihokej,brak\nrolki,2026-10-12,08:30,20:00,Stegny,Samodzielnie,brak,brak,Samodzielne wej\u015Bcia na Tor Stegny\nrolki,2026-10-13,08:30,20:00,Stegny,Samodzielnie,brak,brak,Samodzielne wej\u015Bcia na Tor Stegny\nrolki,2026-10-14,08:30,20:00,Stegny,Samodzielnie,brak,brak,Samodzielne wej\u015Bcia na Tor Stegny\nrolki,2026-10-15,08:30,20:00,Stegny,Samodzielnie,brak,brak,Samodzielne wej\u015Bcia na Tor Stegny\nl\xF3d,2026-10-15,11:45,13:15,Torwar,Mistrzownia,https://www.uksportowy.pl,https://www.uksportowy.pl,brak\nrolki,2026-10-16,08:30,20:00,Stegny,Samodzielnie,brak,brak,Samodzielne wej\u015Bcia na Tor Stegny\nrolki,2026-10-17,08:30,20:00,Stegny,Samodzielnie,brak,brak,Samodzielne wej\u015Bcia na Tor Stegny\nl\xF3d,2026-10-17,21:45,23:00,Torwar,Warszawski Hokej,brak,https://www.facebook.com/warszawskihokej,brak\nrolki,2026-10-18,08:30,20:00,Stegny,Samodzielnie,brak,brak,Samodzielne wej\u015Bcia na Tor Stegny\nl\xF3d,2026-10-18,22:00,23:15,Torwar,Warszawski Hokej,brak,https://www.facebook.com/warszawskihokej,brak\nrolki,2026-10-19,08:30,20:00,Stegny,Samodzielnie,brak,brak,Samodzielne wej\u015Bcia na Tor Stegny\nrolki,2026-10-20,08:30,20:00,Stegny,Samodzielnie,brak,brak,Samodzielne wej\u015Bcia na Tor Stegny\nrolki,2026-10-21,08:30,20:00,Stegny,Samodzielnie,brak,brak,Samodzielne wej\u015Bcia na Tor Stegny\nrolki,2026-10-22,08:30,20:00,Stegny,Samodzielnie,brak,brak,Samodzielne wej\u015Bcia na Tor Stegny\nl\xF3d,2026-10-22,11:45,13:15,Torwar,Mistrzownia,https://www.uksportowy.pl,https://www.uksportowy.pl,brak\nrolki,2026-10-23,08:30,20:00,Stegny,Samodzielnie,brak,brak,Samodzielne wej\u015Bcia na Tor Stegny\nrolki,2026-10-24,08:30,20:00,Stegny,Samodzielnie,brak,brak,Samodzielne wej\u015Bcia na Tor Stegny\nl\xF3d,2026-10-24,21:45,23:00,Torwar,Warszawski Hokej,brak,https://www.facebook.com/warszawskihokej,brak\nrolki,2026-10-25,08:30,20:00,Stegny,Samodzielnie,brak,brak,Samodzielne wej\u015Bcia na Tor Stegny\nl\xF3d,2026-10-25,22:00,23:15,Torwar,Warszawski Hokej,brak,https://www.facebook.com/warszawskihokej,brak\nrolki,2026-10-26,08:30,20:00,Stegny,Samodzielnie,brak,brak,Samodzielne wej\u015Bcia na Tor Stegny\nrolki,2026-10-27,08:30,20:00,Stegny,Samodzielnie,brak,brak,Samodzielne wej\u015Bcia na Tor Stegny\nrolki,2026-10-28,08:30,20:00,Stegny,Samodzielnie,brak,brak,Samodzielne wej\u015Bcia na Tor Stegny\nrolki,2026-10-29,08:30,20:00,Stegny,Samodzielnie,brak,brak,Samodzielne wej\u015Bcia na Tor Stegny\nl\xF3d,2026-10-29,11:45,13:15,Torwar,Mistrzownia,https://www.uksportowy.pl,https://www.uksportowy.pl,brak\nrolki,2026-10-30,08:30,20:00,Stegny,Samodzielnie,brak,brak,Samodzielne wej\u015Bcia na Tor Stegny\nrolki,2026-10-31,08:30,20:00,Stegny,Samodzielnie,brak,brak,Samodzielne wej\u015Bcia na Tor Stegny\nl\xF3d,2026-10-31,21:45,23:00,Torwar,Warszawski Hokej,brak,https://www.facebook.com/warszawskihokej,brak\nl\xF3d,2026-11-01,22:00,23:15,Torwar,Warszawski Hokej,brak,https://www.facebook.com/warszawskihokej,brak\nl\xF3d,2026-11-05,11:45,13:15,Torwar,Mistrzownia,https://www.uksportowy.pl,https://www.uksportowy.pl,brak\nl\xF3d,2026-11-07,21:45,23:00,Torwar,Warszawski Hokej,brak,https://www.facebook.com/warszawskihokej,brak\nl\xF3d,2026-11-08,22:00,23:15,Torwar,Warszawski Hokej,brak,https://www.facebook.com/warszawskihokej,brak\nl\xF3d,2026-11-12,11:45,13:15,Torwar,Mistrzownia,https://www.uksportowy.pl,https://www.uksportowy.pl,brak\nl\xF3d,2026-11-14,21:45,23:00,Torwar,Warszawski Hokej,brak,https://www.facebook.com/warszawskihokej,brak\nl\xF3d,2026-11-15,22:00,23:15,Torwar,Warszawski Hokej,brak,https://www.facebook.com/warszawskihokej,brak\nl\xF3d,2026-11-19,11:45,13:15,Torwar,Mistrzownia,https://www.uksportowy.pl,https://www.uksportowy.pl,brak\nl\xF3d,2026-11-21,21:45,23:00,Torwar,Warszawski Hokej,brak,https://www.facebook.com/warszawskihokej,brak\nl\xF3d,2026-11-22,22:00,23:15,Torwar,Warszawski Hokej,brak,https://www.facebook.com/warszawskihokej,brak\nl\xF3d,2026-11-26,11:45,13:15,Torwar,Mistrzownia,https://www.uksportowy.pl,https://www.uksportowy.pl,brak\nl\xF3d,2026-11-28,21:45,23:00,Torwar,Warszawski Hokej,brak,https://www.facebook.com/warszawskihokej,brak\nl\xF3d,2026-11-29,22:00,23:15,Torwar,Warszawski Hokej,brak,https://www.facebook.com/warszawskihokej,brak\nl\xF3d,2026-12-03,11:45,13:15,Torwar,Mistrzownia,https://www.uksportowy.pl,https://www.uksportowy.pl,brak\nl\xF3d,2026-12-05,21:45,23:00,Torwar,Warszawski Hokej,brak,https://www.facebook.com/warszawskihokej,brak\nl\xF3d,2026-12-06,22:00,23:15,Torwar,Warszawski Hokej,brak,https://www.facebook.com/warszawskihokej,brak\nl\xF3d,2026-12-10,11:45,13:15,Torwar,Mistrzownia,https://www.uksportowy.pl,https://www.uksportowy.pl,brak\nl\xF3d,2026-12-12,21:45,23:00,Torwar,Warszawski Hokej,brak,https://www.facebook.com/warszawskihokej,brak\nl\xF3d,2026-12-13,22:00,23:15,Torwar,Warszawski Hokej,brak,https://www.facebook.com/warszawskihokej,brak\nl\xF3d,2026-12-17,11:45,13:15,Torwar,Mistrzownia,https://www.uksportowy.pl,https://www.uksportowy.pl,brak\nl\xF3d,2026-12-19,21:45,23:00,Torwar,Warszawski Hokej,brak,https://www.facebook.com/warszawskihokej,brak\nl\xF3d,2026-12-20,22:00,23:15,Torwar,Warszawski Hokej,brak,https://www.facebook.com/warszawskihokej,brak\nl\xF3d,2026-12-26,21:45,23:00,Torwar,Warszawski Hokej,brak,https://www.facebook.com/warszawskihokej,brak\nl\xF3d,2026-12-27,22:00,23:15,Torwar,Warszawski Hokej,brak,https://www.facebook.com/warszawskihokej,brak\nl\xF3d,2026-12-31,11:45,13:15,Torwar,Mistrzownia,https://www.uksportowy.pl,https://www.uksportowy.pl,brak\n";
  var form = document.querySelector("#checker-form");
  var dateInput = document.querySelector("#date");
  var timeInput = document.querySelector("#time");
  var result = document.querySelector("#result");
  var resultTitle = document.querySelector("#result-title");
  var resultWindow = document.querySelector("#result-window");
  var eventsList = document.querySelector("#events-list");
  var submitButton = form.querySelector('button[type="submit"]');
  var schedule;
  var STATUS = {
    yes: { label: "Mo\u017Cna gra\u0107", className: "yes" },
    warning: { label: "Sprawd\u017A ostrze\u017Cenia", className: "warning" },
    no: { label: "Warunki nie pozwalaj\u0105", className: "no" },
    unknown: { label: "Brak pe\u0142nych danych", className: "unknown" }
  };
  function localIsoDate(date = /* @__PURE__ */ new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  function localIsoTime(date = /* @__PURE__ */ new Date()) {
    return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  }
  function setDefaults() {
    const now = /* @__PURE__ */ new Date();
    dateInput.value = localIsoDate(now);
    timeInput.value = localIsoTime(now);
  }
  function formatMoment(value) {
    return new Intl.DateTimeFormat("pl-PL", {
      weekday: "short",
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    }).format(new Date(value));
  }
  function linkOrText(value, label) {
    if (!value || value.toLowerCase() === "brak") {
      const span = document.createElement("span");
      span.textContent = `${label}: brak`;
      return span;
    }
    const link = document.createElement("a");
    link.href = value.startsWith("http") ? value : `https://${value}`;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = label;
    return link;
  }
  function makeEventCard(event, evaluation) {
    var _a;
    const card = document.createElement("article");
    const status = (_a = STATUS[evaluation.status]) != null ? _a : STATUS.unknown;
    card.className = `event-card ${status.className}`;
    const top = document.createElement("div");
    top.className = "event-card-top";
    const when = document.createElement("p");
    when.className = "event-time";
    when.textContent = `${event.date} \xB7 ${event.start}\u2013${evaluation.effectiveEnd}`;
    const badge = document.createElement("span");
    badge.className = "status-badge";
    badge.textContent = status.label;
    top.append(when, badge);
    const title = document.createElement("h3");
    title.textContent = event.organizer;
    const venue = document.createElement("p");
    venue.className = "event-venue";
    venue.textContent = `${event.venue} \xB7 ${event.typeLabel}`;
    const reasons = document.createElement("ul");
    reasons.className = "event-reasons";
    for (const reason of evaluation.reasons) {
      const item = document.createElement("li");
      item.textContent = reason.message;
      reasons.append(item);
    }
    const meta = document.createElement("div");
    meta.className = "event-meta";
    meta.append(linkOrText(event.registration, "Zapisy"), linkOrText(event.contact, "Kontakt"));
    if (event.notes && event.notes.toLowerCase() !== "brak") {
      const note = document.createElement("span");
      note.textContent = event.notes;
      meta.append(note);
    }
    card.append(top, title, venue, reasons, meta);
    return card;
  }
  async function weatherForEvents(events) {
    const dates = [...new Set(events.filter((event) => schedule.venues[event.venue].surface === "outdoor").map((event) => event.date))];
    const entries = await Promise.all(dates.map(async (date) => {
      const event = events.find((item) => item.date === date && schedule.venues[item.venue].surface === "outdoor");
      const venue = schedule.venues[event.venue];
      try {
        return [date, await fetchOpenMeteo({ latitude: venue.latitude, longitude: venue.longitude, date })];
      } catch (error) {
        return [date, { error }];
      }
    }));
    return new Map(entries);
  }
  function resultCountLabel(count) {
    if (count === 1) return "1 dost\u0119pny termin";
    const lastTwo = count % 100;
    const last = count % 10;
    if (last >= 2 && last <= 4 && !(lastTwo >= 12 && lastTwo <= 14)) return `${count} dost\u0119pne terminy`;
    return `${count} dost\u0119pnych termin\xF3w`;
  }
  async function showEvents(centerDateTime, hockey) {
    const events = findEventsInWindow(schedule.events, centerDateTime, { hockey });
    result.hidden = false;
    resultTitle.textContent = resultCountLabel(events.length);
    const center = new Date(centerDateTime);
    resultWindow.textContent = `${formatMoment(new Date(center.getTime() - 864e5))} \u2014 ${formatMoment(new Date(center.getTime() + 864e5))}`;
    eventsList.replaceChildren();
    if (!events.length) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = "W tym 48-godzinnym oknie nie ma wpisanych termin\xF3w.";
      eventsList.append(empty);
      return;
    }
    const weatherByDate = await weatherForEvents(events);
    for (const event of events) {
      const venue = schedule.venues[event.venue];
      const weatherData = weatherByDate.get(event.date);
      const evaluation = (weatherData == null ? void 0 : weatherData.error) ? { status: "unknown", reasons: [{ message: `Nie uda\u0142o si\u0119 pobra\u0107 prognozy: ${weatherData.error.message}` }], effectiveEnd: event.end } : evaluateEvent({ event, venue, weather: weatherData, sunset: weatherData == null ? void 0 : weatherData.sunset });
      eventsList.append(makeEventCard(event, evaluation));
    }
    result.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  async function loadSchedule() {
    schedule = parseScheduleCsv(EMBEDDED_SCHEDULE_CSV);
  }
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    submitButton.disabled = true;
    const originalText = submitButton.firstChild.textContent;
    submitButton.firstChild.textContent = "Szukam\u2026 ";
    try {
      await showEvents(`${dateInput.value}T${timeInput.value}`, form.elements.hockey.value);
    } catch (error) {
      result.hidden = false;
      resultTitle.textContent = "Nie uda\u0142o si\u0119 wyszuka\u0107 termin\xF3w";
      resultWindow.textContent = "";
      eventsList.replaceChildren();
      const message = document.createElement("div");
      message.className = "empty-state";
      message.textContent = error.message;
      eventsList.append(message);
    } finally {
      submitButton.disabled = false;
      submitButton.firstChild.textContent = originalText;
    }
  });
  setDefaults();
  loadSchedule().catch((error) => {
    result.hidden = false;
    resultTitle.textContent = "B\u0142\u0105d harmonogramu";
    eventsList.textContent = error.message;
    submitButton.disabled = true;
  });
})();
