"""WindSage AI: local, synthetic-data-only turbine alarm intelligence demo."""
import io
import os
import sqlite3
from datetime import date, datetime, timedelta

import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
import streamlit as st

st.set_page_config(page_title="WindSage AI", page_icon="🌬️", layout="wide")

DB_PATH = "windsage.db"
REQUIRED = ["alarm_id", "timestamp", "turbine_id", "alarm_code", "description", "severity", "duration_min", "status"]
SEVERITY_ORDER = ["Critical", "High", "Medium", "Low"]
COLORS = {"Critical": "#ef4444", "High": "#f59e0b", "Medium": "#06b6d4", "Low": "#22c55e"}

st.markdown("""<style>
 .stApp {background:#f2f7fa;color:#172033} [data-testid="stSidebar"]{background:#0b2035}
 [data-testid="stSidebar"] *{color:#e8f2f8} h1{color:#eafaff!important} h2,h3{color:#0b3954}
 .block-container{padding-top:1.4rem}
 .hero{background:linear-gradient(120deg,#0a2843,#0c6470);padding:24px 30px;border-radius:15px;color:white;margin-bottom:18px}
 .hero h1{margin:0!important;font-size:2.3rem}.hero p{margin:5px 0 0;color:#bceff0;font-size:1.08rem}
 .metric-card{background:white;border-radius:12px;padding:14px 17px;border-left:5px solid #14b8a6;box-shadow:0 3px 13px #03101c22;min-height:98px}
 .metric-card .label{font-size:.76rem;font-weight:700;text-transform:uppercase;color:#577080}.metric-card .value{font-size:1.75rem;font-weight:800;color:#0b2c45;margin-top:5px}.metric-card .note{font-size:.72rem;color:#6c8492}
 .notice{padding:12px 16px;border-radius:8px;background:#fff7df;border-left:4px solid #f59e0b;color:#624b13;margin:10px 0}
 div[data-testid="stDataFrame"]{border:1px solid #d8e4e9;border-radius:8px}
</style>""", unsafe_allow_html=True)


def db():
    con = sqlite3.connect(DB_PATH, check_same_thread=False)
    con.execute("""CREATE TABLE IF NOT EXISTS incidents (
        incident_id INTEGER PRIMARY KEY AUTOINCREMENT, alarm_id TEXT, turbine_id TEXT,
        title TEXT, technician TEXT, priority TEXT, due_date TEXT, status TEXT,
        notes TEXT, resolution_summary TEXT, created_at TEXT, resolved_at TEXT)""")
    con.commit()
    return con


def seed_demo_incidents():
    """Populate the local incident register once so maintenance tracking is demo-ready."""
    con = db()
    if con.execute("SELECT COUNT(*) FROM incidents").fetchone()[0] == 0:
        now = datetime.now()
        rows = [
            ("ALM-1001", "WT-03", "Replace drivetrain bearing set", "Alex Morgan", "Critical",
             str(date.today() + timedelta(days=1)), "In Progress",
             "Vibration at 11.4 mm/s. Bearing inspection scheduled; crane booked.", "", (now - timedelta(days=2)).isoformat(), None),
            ("ALM-1003", "WT-07", "Investigate gearbox oil overheating", "Priya Shah", "High",
             str(date.today() + timedelta(days=3)), "Assigned",
             "Cooler fan inspected; oil sample sent to lab.", "", (now - timedelta(days=1)).isoformat(), None),
            ("ALM-1005", "WT-03", "Repair hydraulic pressure drop", "Jordan Lee", "High",
             str(date.today() - timedelta(days=1)), "Open",
             "Suspected hose leak near the pitch manifold.", "", (now - timedelta(hours=30)).isoformat(), None),
            ("ALM-1002", "WT-03", "Pitch system vibration follow-up", "Field Team A", "Medium",
             str(date.today() - timedelta(days=3)), "Resolved",
             "Re-torqued pitch bearing bolts.", "Re-torque completed; vibration reduced to 4.1 mm/s.",
             (now - timedelta(days=5)).isoformat(), (now - timedelta(days=1)).isoformat()),
        ]
        con.executemany(
            """INSERT INTO incidents
               (alarm_id, turbine_id, title, technician, priority, due_date, status, notes,
                resolution_summary, created_at, resolved_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?)""", rows)
        con.commit()
    con.close()


def demo_data():
    """Deterministic synthetic dataset with recurrence intentionally concentrated on WT-03."""
    import random
    random.seed(14)
    templates = [
        ("VIB-201", "Drivetrain vibration above warning threshold", "High"),
        ("TMP-310", "Gearbox oil temperature high", "High"),
        ("HYD-410", "Hydraulic pressure outside operating band", "Medium"),
        ("COM-101", "Controller communication timeout", "Low"),
        ("PIT-220", "Pitch actuator response slow", "Medium"),
    ]
    rows, start = [], datetime.now().replace(minute=0, second=0, microsecond=0) - timedelta(days=29)
    for i in range(110):
        turbine = "WT-03" if i % 4 == 0 else f"WT-{random.randint(1, 10):02d}"
        code, desc, default = templates[i % len(templates)] if turbine != "WT-03" else templates[i % 3]
        severity = default
        if turbine == "WT-03" and code == "VIB-201": severity = random.choice(["High", "Critical", "Critical"])
        dur = random.randint(12, 95) + (90 if severity == "Critical" else 0)
        vib = round(random.uniform(2.0, 6.5) + (random.uniform(3, 7) if code == "VIB-201" else 0), 1)
        temp = round(random.uniform(55, 78) + (random.uniform(10, 22) if code == "TMP-310" else 0), 1)
        pressure = round(random.uniform(155, 180) - (random.uniform(35, 55) if code == "HYD-410" else 0), 1)
        rows.append({"alarm_id": f"ALM-{1000+i}", "timestamp": start + timedelta(hours=i*6 + random.randint(0,3)),
            "turbine_id": turbine, "alarm_code": code, "description": desc, "severity": severity,
            "duration_min": dur, "status": random.choices(["Active","Acknowledged","Resolved"],[.42,.23,.35])[0],
            "vibration_mm_s": vib, "temperature_c": temp, "hydraulic_pressure_bar": pressure,
            "estimated_power_kw": random.randint(1500, 3300)})
    return enrich(pd.DataFrame(rows))


def enrich(data):
    data = data.copy()
    data["timestamp"] = pd.to_datetime(data["timestamp"], errors="coerce")
    data["duration_min"] = pd.to_numeric(data["duration_min"], errors="coerce").fillna(0)
    for c, default in [("vibration_mm_s", 0), ("temperature_c", 0), ("hydraulic_pressure_bar", 170), ("estimated_power_kw", 2500)]:
        data[c] = pd.to_numeric(data[c], errors="coerce").fillna(default) if c in data else default
    data["recurrence"] = data.groupby(["turbine_id", "alarm_code"])["alarm_id"].transform("count")
    sev = data["severity"].map({"Low": 8, "Medium": 22, "High": 40, "Critical": 58}).fillna(10)
    risk = sev + (data["recurrence"] * 3) + (data["vibration_mm_s"] > 8)*12 + (data["temperature_c"] > 85)*10 + (data["duration_min"] > 90)*8
    data["risk_score"] = risk.clip(0, 100).astype(int)
    data["risk_category"] = pd.cut(data["risk_score"], [-1, 34, 64, 100], labels=["Low", "Medium", "High"])
    data["priority_score"] = (sev + data["recurrence"]*3 + (data["duration_min"].clip(upper=240)/240*18) + ((3500-data["estimated_power_kw"]).clip(lower=0)/3500*18)).clip(0,100).round().astype(int)
    return data


def validate_upload(raw):
    try:
        df = pd.read_csv(raw)
    except Exception as e:
        return None, f"Could not read CSV: {e}"
    missing = [c for c in REQUIRED if c not in df.columns]
    if missing: return None, "Missing required columns: " + ", ".join(missing)
    if df.empty: return None, "The uploaded CSV contains no rows."
    if df["timestamp"].isna().all() or pd.to_datetime(df["timestamp"], errors="coerce").isna().any():
        return None, "Timestamp values must be valid dates (for example: 2026-10-20 06:15:00)."
    return enrich(df), None


def incidents_df():
    con = db(); out = pd.read_sql_query("SELECT * FROM incidents ORDER BY incident_id DESC", con); con.close(); return out


def metric(label, value, note=""):
    st.markdown(f'<div class="metric-card"><div class="label">{label}</div><div class="value">{value}</div><div class="note">{note}</div></div>', unsafe_allow_html=True)


def header():
    st.markdown('<div class="hero"><h1>🌬️ WindSage AI</h1><p>From turbine alarms to actionable maintenance intelligence.</p></div>', unsafe_allow_html=True)


def root_cause(row):
    code = row["alarm_code"]
    if code.startswith("VIB") or row["vibration_mm_s"] > 8:
        return ("Drivetrain bearing, gearbox, or rotor imbalance", f"Vibration is {row['vibration_mm_s']:.1f} mm/s; {int(row['recurrence'])} matching alarms on this turbine.", "Inspect bearing condition, gearbox oil/debris, alignment and rotor balance.", 86)
    if code.startswith("TMP") or row["temperature_c"] > 85:
        return ("Cooling, lubrication, or gearbox thermal issue", f"Temperature is {row['temperature_c']:.1f}°C; threshold rule matched.", "Check oil level/quality, cooler flow and temperature sensor calibration.", 79)
    if code.startswith("HYD") or not 140 <= row["hydraulic_pressure_bar"] <= 190:
        return ("Hydraulic system pressure or leak issue", f"Hydraulic pressure is {row['hydraulic_pressure_bar']:.0f} bar; expected operating band is 140–190 bar.", "Inspect hoses, filters, pump condition and pressure transducer.", 77)
    if code.startswith("COM"):
        return ("Sensor, network, or controller communication issue", f"Communication alarm has recurred {int(row['recurrence'])} times.", "Inspect connector integrity, network switch logs and controller diagnostics.", 72)
    return ("Pitch actuator or related control-system issue", "Alarm code maps to pitch control rule.", "Inspect actuator response, hydraulic supply and position feedback.", 68)


def alarm_selector(data, key="selected_alarm"):
    choices = data.sort_values("timestamp", ascending=False)
    labels = {r.alarm_id: f"{r.alarm_id} · {r.turbine_id} · {r.alarm_code} · {r.severity}" for r in choices.itertuples()}
    current = st.session_state.get("selected_id", choices.iloc[0]["alarm_id"])
    index = list(labels).index(current) if current in labels else 0
    selected = st.selectbox("Select an alarm", list(labels), index=index, format_func=lambda x: labels[x], key=key)
    st.session_state.selected_id = selected
    return data.loc[data.alarm_id == selected].iloc[0]


def overview(data):
    header(); active = data[data.status != "Resolved"]; inc = incidents_df(); open_inc = len(inc[inc.status != "Resolved"]) if not inc.empty else 0
    est_loss = (active.duration_min * active.estimated_power_kw / 60).sum()
    mttr = "—"
    if not inc.empty:
        done = inc.dropna(subset=["resolved_at"])
        if not done.empty:
            mttr = f"{((pd.to_datetime(done.resolved_at) - pd.to_datetime(done.created_at)).dt.total_seconds() / 3600).mean():.1f} h"
    cols = st.columns(6)
    values = [("Active alarms", len(active), "Synthetic demo data"), ("Critical alarms", int((active.severity=="Critical").sum()), "Needs human review"), ("High-risk turbines", data[data.risk_category=="High"].turbine_id.nunique(), "Demo risk indicator"), ("Open incidents", open_inc, "SQLite-backed"), ("Average MTTR", mttr, "Resolved incidents"), ("Est. production loss", f"{est_loss/1000:.1f} MWh", "Simulated estimate")]
    for c, v in zip(cols, values):
        with c: metric(*v)
    st.markdown("### Operations pulse")
    a,b = st.columns(2)
    with a:
        sev = data.severity.value_counts().reindex(SEVERITY_ORDER, fill_value=0).reset_index(); sev.columns=["Severity","Alarms"]
        st.plotly_chart(px.bar(sev,x="Severity",y="Alarms",color="Severity",color_discrete_map=COLORS, title="Alarms by severity"), use_container_width=True)
    with b:
        timeline = data.groupby(data.timestamp.dt.date).size().reset_index(name="Alarms"); timeline.columns=["Date","Alarms"]
        st.plotly_chart(px.line(timeline,x="Date",y="Alarms",markers=True,title="Alarms over time", color_discrete_sequence=["#14b8a6"]), use_container_width=True)
    a,b = st.columns(2)
    with a:
        top = data.alarm_code.value_counts().head(7).reset_index(); top.columns=["Alarm type","Occurrences"]
        st.plotly_chart(px.bar(top,x="Occurrences",y="Alarm type",orientation="h",title="Top recurring alarm types",color_discrete_sequence=["#0e7490"]),use_container_width=True)
    with b:
        td = data.turbine_id.value_counts().reset_index(); td.columns=["Turbine","Alarms"]
        st.plotly_chart(px.bar(td,x="Turbine",y="Alarms",title="Turbine-wise alarm distribution",color_discrete_sequence=["#14b8a6"]),use_container_width=True)
    if not inc.empty:
        st.plotly_chart(px.pie(inc,names="status",title="Incident status breakdown",hole=.55,color_discrete_sequence=["#14b8a6","#f59e0b","#ef4444","#22c55e"]),use_container_width=True)
    st.info("**How it works:** Alarm and sensor data → validation → feature engineering → transparent root-cause rules + risk indicator + priority engine → operator dashboard → human-reviewed maintenance action → feedback and KPI monitoring.")


def alarm_center(data):
    header(); st.subheader("Alarm Center")
    c1,c2,c3,c4=st.columns(4)
    with c1: turbines=st.multiselect("Turbine",sorted(data.turbine_id.unique()))
    with c2: severities=st.multiselect("Severity",SEVERITY_ORDER)
    with c3: statuses=st.multiselect("Status",sorted(data.status.unique()))
    with c4: dates=st.date_input("Date range",(data.timestamp.min().date(),data.timestamp.max().date()))
    query=st.text_input("Search alarm ID, code, or description")
    shown=data.copy()
    if turbines: shown=shown[shown.turbine_id.isin(turbines)]
    if severities: shown=shown[shown.severity.isin(severities)]
    if statuses: shown=shown[shown.status.isin(statuses)]
    if len(dates)==2: shown=shown[(shown.timestamp.dt.date>=dates[0])&(shown.timestamp.dt.date<=dates[1])]
    if query: shown=shown[shown.astype(str).apply(lambda x:x.str.contains(query,case=False).any(),axis=1)]
    st.caption(f"{len(shown)} matching alarms · Select a row by choosing its ID below for details.")
    display=["alarm_id","timestamp","turbine_id","alarm_code","description","severity","duration_min","status","priority_score"]
    st.dataframe(shown[display].sort_values("timestamp",ascending=False),use_container_width=True,hide_index=True)
    if not shown.empty:
        row=alarm_selector(shown,"alarm_center_picker"); cause,evidence,action,confidence=root_cause(row)
        st.markdown("### Selected alarm detail")
        st.write({"Possible root cause":cause,"Recommended next action":action,"Priority score":f"{row.priority_score}/100","Rule evidence":evidence})


def insights(data):
    header(); st.subheader("AI Insights")
    st.markdown('<div class="notice">All outputs below are illustrative, transparent demo rules—not validated diagnoses or predictive models. Human review is required.</div>',unsafe_allow_html=True)
    row=alarm_selector(data,"insight_picker"); cause,evidence,action,confidence=root_cause(row)
    a,b,c=st.columns(3)
    with a: metric("Suggested cause",cause,"Rule-based suggestion")
    with b: metric("Rule-match confidence",f"{confidence}%",evidence)
    with c: metric("Recommended inspection",action,"Advisory only")
    st.markdown("### B. Failure-risk indicator")
    x,y=st.columns([1,2]);
    with x:
        fig=go.Figure(go.Indicator(mode="gauge+number",value=row.risk_score,title={"text":"Demo risk score / 100"},gauge={"axis":{"range":[0,100]},"bar":{"color":"#ef4444" if row.risk_category=="High" else "#f59e0b"},"steps":[{"range":[0,35],"color":"#dcfce7"},{"range":[35,65],"color":"#fef3c7"},{"range":[65,100],"color":"#fee2e2"}]})); st.plotly_chart(fig,use_container_width=True)
    with y: st.write(f"**{row.risk_category} risk** — Demo risk indicator — not a validated predictive model."); st.write(f"Factors: severity ({row.severity}), recurrence ({int(row.recurrence)}), vibration ({row.vibration_mm_s:.1f} mm/s), temperature ({row.temperature_c:.1f}°C), duration ({row.duration_min:.0f} min).")
    st.markdown("### C. Explainable alarm priority engine")
    weights=st.columns(4); vals=[]
    for col,label,default in zip(weights,["Severity","Recurrence","Duration","Operational impact"],[45,25,15,15]):
        with col: vals.append(st.slider(label,0,60,default,key="w_"+label))
    raw=( {"Low":8,"Medium":22,"High":40,"Critical":58}.get(row.severity,10)/58*vals[0] + min(row.recurrence,10)/10*vals[1] + min(row.duration_min,240)/240*vals[2] + max(0,3500-row.estimated_power_kw)/3500*vals[3])
    normalized=round(raw/max(sum(vals),1)*100)
    st.success(f"Configured priority score: **{normalized}/100**. Why: {row.severity} severity, {int(row.recurrence)} recurrence events, {row.duration_min:.0f}-minute duration, and simulated availability impact.")


def workflow(data):
    header(); st.subheader("Maintenance Workflow")
    st.caption("Incidents are stored locally in SQLite (`windsage.db`) and persist across app reruns.")
    inc = incidents_df()
    if not inc.empty:
        due = pd.to_datetime(inc["due_date"], errors="coerce")
        open_inc = inc[inc["status"] != "Resolved"]
        overdue = ((due < pd.Timestamp(date.today())) & (inc["status"] != "Resolved")).sum()
        resolved = inc.dropna(subset=["resolved_at"])
        mttr = "—"
        if not resolved.empty:
            hours = (pd.to_datetime(resolved["resolved_at"]) - pd.to_datetime(resolved["created_at"])).dt.total_seconds() / 3600
            mttr = f"{hours.mean():.1f} h"
        k = st.columns(5)
        for col, args in zip(k, [
            ("Open incidents", len(open_inc), "Not yet resolved"),
            ("In progress", int((inc["status"] == "In Progress").sum()), "Technician on site"),
            ("Overdue", int(overdue), "Past due date"),
            ("Critical open", int(((inc["priority"] == "Critical") & (inc["status"] != "Resolved")).sum()), "Needs escalation"),
            ("MTTR", mttr, "Resolved incidents"),
        ]):
            with col: metric(*args)
        st.divider()
    row = alarm_selector(data, "workflow_picker")
    with st.form("create_incident", clear_on_submit=True):
        st.markdown(f"Create incident from **{row.alarm_id}** · **{row.turbine_id}**")
        a,b,c = st.columns(3)
        title = a.text_input("Title", f"Investigate {row.alarm_code} on {row.turbine_id}")
        tech = b.selectbox("Assign technician", ["Unassigned","Alex Morgan","Priya Shah","Jordan Lee","Field Team A"])
        priority = c.selectbox("Priority", ["Critical","High","Medium","Low"], index=1)
        due = st.date_input("Due date", date.today()+timedelta(days=2)); notes = st.text_area("Initial technician notes")
        if st.form_submit_button("Create maintenance incident", type="primary"):
            con=db(); con.execute("INSERT INTO incidents (alarm_id,turbine_id,title,technician,priority,due_date,status,notes,created_at) VALUES (?,?,?,?,?,?,?,?,?)",(row.alarm_id,row.turbine_id,title,tech,priority,str(due),"Assigned" if tech!="Unassigned" else "Open",notes,datetime.now().isoformat()));con.commit();con.close();st.success("Incident created and saved locally.");st.rerun()
    inc = incidents_df(); st.markdown("### Incident register")
    if inc.empty: st.info("No maintenance incidents yet. Create one above."); return
    status_filter = st.multiselect("Filter register by status", ["Open","Assigned","In Progress","Resolved"], default=["Open","Assigned","In Progress"])
    view = inc.copy()
    view["overdue"] = (pd.to_datetime(view["due_date"], errors="coerce") < pd.Timestamp(date.today())) & (view["status"] != "Resolved")
    if status_filter: view = view[view["status"].isin(status_filter)]
    st.dataframe(
        view[["incident_id","alarm_id","turbine_id","title","technician","priority","due_date","status","overdue","created_at"]],
        use_container_width=True, hide_index=True,
        column_config={"overdue": st.column_config.CheckboxColumn("Overdue")},
    )
    st.download_button("Download incident register (CSV)", inc.to_csv(index=False), "windsage_incidents.csv", "text/csv")
    st.markdown("### Update an incident")
    iid = st.selectbox("Update incident", inc.incident_id.tolist(), format_func=lambda i:f"#{i} — {inc.loc[inc.incident_id==i,'title'].iloc[0]}")
    current = inc[inc.incident_id==iid].iloc[0]
    with st.form("update_incident"):
        status = st.selectbox("Status", ["Open","Assigned","In Progress","Resolved"], index=["Open","Assigned","In Progress","Resolved"].index(current.status))
        tech = st.selectbox("Technician", ["Unassigned","Alex Morgan","Priya Shah","Jordan Lee","Field Team A"], index=max(0,["Unassigned","Alex Morgan","Priya Shah","Jordan Lee","Field Team A"].index(current.technician) if current.technician in ["Unassigned","Alex Morgan","Priya Shah","Jordan Lee","Field Team A"] else 0))
        notes = st.text_area("Technician notes", current.notes or ""); summary = st.text_area("Resolution summary", current.resolution_summary or "")
        if st.form_submit_button("Save workflow update"):
            resolved = datetime.now().isoformat() if status == "Resolved" else None
            con=db(); con.execute("UPDATE incidents SET status=?,technician=?,notes=?,resolution_summary=?,resolved_at=COALESCE(?,resolved_at) WHERE incident_id=?",(status,tech,notes,summary,resolved,int(iid)));con.commit();con.close();st.success("Incident updated.");st.rerun()


def lpf(data):
    header();st.subheader("LPF Analytics")
    st.markdown('<div class="notice">Simulated planning indicators only. Estimates use alarm duration × simulated unavailable power (3.5 MW nominal minus estimated power); overlapping periods are consolidated per turbine before aggregation. This is not actual LPF, savings, or financial reporting.</div>',unsafe_allow_html=True)
    events=[]
    for r in data.itertuples(): events.append((r.turbine_id,r.timestamp,r.timestamp+timedelta(minutes=r.duration_min),max(0,3500-r.estimated_power_kw)))
    # Conservative interval union prevents duration double-counting; use max unavailable power in each merged group.
    total=0; by_t={}
    for turbine in data.turbine_id.unique():
        es=sorted([e for e in events if e[0]==turbine],key=lambda e:e[1]); merged=[]
        for _,s,e,p in es:
            if merged and s<=merged[-1][1]: merged[-1]=(merged[-1][0],max(merged[-1][1],e),max(merged[-1][2],p))
            else: merged.append((s,e,p))
        loss=sum((e-s).total_seconds()/3600*p for s,e,p in merged);by_t[turbine]=loss;total+=loss
    baseline=len(data.timestamp.dt.date.unique())*24*3500*data.turbine_id.nunique();pct=total/baseline*100 if baseline else 0
    inc=incidents_df(); mttr="—"
    if not inc.empty and "resolved_at" in inc:
        z=inc.dropna(subset=["resolved_at"])
        if not z.empty: mttr=f"{((pd.to_datetime(z.resolved_at)-pd.to_datetime(z.created_at)).dt.total_seconds()/3600).mean():.1f} h"
    a,b,c=st.columns(3)
    with a:metric("Estimated lost energy",f"{total/1000:.1f} MWh","Simulated, overlap-adjusted")
    with b:metric("Estimated lost production",f"{pct:.2f}%","Against simulated 3.5 MW baseline")
    with c:metric("Recorded incident MTTR",mttr,"From resolved local incidents")
    losses=pd.DataFrame({"Turbine":list(by_t),"Estimated loss (kWh)":list(by_t.values())}).sort_values("Estimated loss (kWh)",ascending=False)
    st.plotly_chart(px.bar(losses,x="Turbine",y="Estimated loss (kWh)",title="Top turbines associated with estimated losses",color_discrete_sequence=["#ef4444"]),use_container_width=True)
    relation=data.assign(loss_kwh=data.duration_min/60*(3500-data.estimated_power_kw).clip(lower=0))
    st.plotly_chart(px.scatter(relation,x="duration_min",y="loss_kwh",color="severity",color_discrete_map=COLORS,hover_name="turbine_id",title="Alarm-to-downtime relationship (simulated)"),use_container_width=True)
    if not inc.empty and inc.resolved_at.notna().any():
        done=inc.dropna(subset=["resolved_at"]).copy();done["resolved_date"]=pd.to_datetime(done.resolved_at).dt.date;done["mttr_h"]=(pd.to_datetime(done.resolved_at)-pd.to_datetime(done.created_at)).dt.total_seconds()/3600
        st.plotly_chart(px.line(done,x="resolved_date",y="mttr_h",markers=True,title="MTTR trend from resolved incidents"),use_container_width=True)


def upload():
    header();st.subheader("Data Upload")
    st.write("Upload alarm CSV data. Required columns: `"+"`, `".join(REQUIRED)+"`.")
    with open("sample_data/synthetic_alarms.csv","rb") as f: st.download_button("Download sample CSV template",f,"windsage_sample_alarms.csv","text/csv")
    file=st.file_uploader("Upload CSV",type="csv")
    if file:
        result,error=validate_upload(file)
        if error:st.error(error)
        else:
            st.success(f"Validated {len(result)} rows. Click below to use this dataset for this browser session.")
            st.dataframe(result.head(),use_container_width=True)
            if st.button("Use uploaded data",type="primary"):st.session_state.data=result;st.session_state.selected_id=result.iloc[0].alarm_id;st.success("Uploaded data loaded.")


def main():
    with st.sidebar:
        st.markdown("## 🌬️ WindSage AI")
        st.caption("Synthetic, local demo · advisory only")
        if st.button("Load Demo Data",type="primary",use_container_width=True): st.session_state.data=demo_data();st.session_state.selected_id=st.session_state.data.iloc[0].alarm_id
        page=st.radio("Navigate",["Overview","Alarm Center","AI Insights","Maintenance Workflow","LPF Analytics","Data Upload"])
        st.divider();st.caption("No external APIs, SCADA connections, or turbine controls. Recommendations require human review.")
    if "data" not in st.session_state:
        st.session_state.data=demo_data()
        st.session_state.selected_id=st.session_state.data.iloc[0].alarm_id
    seed_demo_incidents()
    data=st.session_state.data
    {"Overview":overview,"Alarm Center":alarm_center,"AI Insights":insights,"Maintenance Workflow":workflow,"LPF Analytics":lpf,"Data Upload":lambda _:upload()}[page](data)

if __name__ == "__main__": main()
