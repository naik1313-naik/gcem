# WindSage AI

**WindSage AI** is a local, hackathon-ready Streamlit demo for turning wind turbine alarm data into human-reviewed maintenance intelligence. It uses synthetic demo data, transparent rules, and a local SQLite database. It never connects to turbines, SCADA, or external APIs.

## Run locally

```bash
python3 -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
streamlit run app.py
```

Open the local URL Streamlit prints (normally `http://localhost:8501`). Click **Load Demo Data** in the sidebar to start.

## Included files

- `app.py` — dashboard, severity filters, root-cause suggestions, risk scoring, upload validation, and maintenance workflow
- `sample_data/synthetic_alarms.csv` — synthetic, upload-ready alarms
- `.streamlit/config.toml` — light theme and local-demo defaults
- `windsage.db` — created automatically on first run; stores incidents locally (seeded with four example work orders)

## Dashboard features

- **Overview** — active/critical alarm counts, simulated production loss, MTTR, severity mix, alarm trends, and turbine hot spots.
- **Alarm Center** — filter by turbine, severity, status, date range, and free-text search; select any alarm for its suggested root cause.
- **AI Insights** — transparent rule-based root-cause suggestions, failure-risk indicator, and an adjustable priority engine.
- **Maintenance Workflow** — create, assign, update, and resolve work orders; track overdue tickets, critical open tickets, and MTTR. Data persists in SQLite.
- **LPF Analytics** — clearly labelled simulated lost-energy and downtime indicators.
- **Data Upload** — validate and load your own CSV for the current session.

## Expected CSV columns

Required: `alarm_id`, `timestamp`, `turbine_id`, `alarm_code`, `description`, `severity`, `duration_min`, `status`.

Optional sensor columns: `vibration_mm_s`, `temperature_c`, `hydraulic_pressure_bar`, `estimated_power_kw`.

## Demo flow

1. Load demo data and review the **Overview**.
2. In **Alarm Center**, filter for `WT-03` to see recurring alarms, or filter by **Critical** severity.
3. Select an alarm and open **AI Insights** for root-cause rules, risk, and priority explanations.
4. Open **Maintenance Workflow** to review the seeded work orders, overdue items, and MTTR; create or update an incident. Changes persist in SQLite.
5. Review clearly labelled simulated loss and MTTR indicators in **LPF Analytics**.
6. Optionally upload `sample_data/synthetic_alarms.csv` from **Data Upload** to test the validation flow.

## Important limitations

All source data and outputs in the supplied demo are synthetic. Root-cause suggestions, priority, and risk are illustrative rule-based aids—not validated diagnoses or predictive models. Operators must review all recommendations. LPF and energy estimates are simulated planning indicators, not actual production or financial results.
