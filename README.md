# Geographic Information System for Municipal Property Management

## Project Description

This project is a web-based geographic information system for municipal property management. The system combines cartographic visualization and predictive analytics in a single platform.

**Key Features:**

- **Map visualization** – all municipal properties are displayed on an interactive map with color-coded status indicators (green – leased, red – overdue, blue – free, gray – renovation, yellow – contract expiring)
- **Property card** – clicking on a marker opens detailed property information, lease agreements, payment history, and PDF contract download
- **Revenue analytics** – key performance indicators (KPI), revenue charts by district and property type, renter reliability ranking
- **Forecasting** – 3-month revenue forecast using linear regression
- **Email notifications** – automated alerts for overdue payments and upcoming due dates

## Technologies

- **Node.js** – server-side runtime
- **Express** – REST API framework
- **PostgreSQL** – data storage for properties, contracts, payments, and renters
- **PostGIS** – geospatial data handling
- **Leaflet** – interactive mapping library
- **Chart.js** – chart and graph rendering
- **PDFKit** – PDF contract generation
- **Nodemailer** – email notification delivery

# CHAPTER 1 – CARTOGRAPHIC MODULE

## Map and Objects

This chapter implements the interactive map and object visualization.

**Map Features:**

- Display of all municipal property objects on the map of Kemerovo
- Color-coded markers indicating property status
- Zoom and pan controls
- Legend with status explanations

**Object Card:**

Clicking on a marker opens a popup card with:

- Property name, address, cadastral number
- Current status with color indication
- List of lease agreements (contract number, term, rent amount, area)
- Recent payment history (date, amount, status)
- PDF contract download button

### API Endpoints

1. **Get Object Coordinates** – `GET`  
   `http://localhost:3000/api/coordinates`  
   Returns all objects with coordinates, names, addresses, cadastral numbers, and statuses.

2. **Get Contracts by Object** – `GET`  
   `http://localhost:3000/api/contracts/:objectId`  
   Returns lease agreements for the specified object.

3. **Get Payments by Contract** – `GET`  
   `http://localhost:3000/api/payments/:leaseId`  
   Returns payment history for the specified contract.

4. **Download Contract PDF** – `POST`  
   `http://localhost:3000/api/download-contract/:leaseId`  
   Generates and downloads a PDF file of the lease agreement.

# CHAPTER 2 – ANALYTICS MODULE

## Key Performance Indicators and Dashboards

This chapter implements the analytics dashboard with KPIs and charts.

**KPI Panel:**

- Total number of properties
- Number of leased properties and occupancy percentage
- Average rental rate per square meter
- Total overdue amount and number of properties with debts

**Analytics Charts:**

1. **District Revenue Chart** – Bar chart showing income by district (Leninsky, Tsentralny, Rudnichny, Kirovsky, Zavodsky)

2. **Property Type Chart** – Doughnut chart showing income distribution by property type (kindergartens, schools, offices, premises, structures)

3. **Top-5 Properties by Income** – Bar chart of the five most profitable properties

4. **Renter Reliability Ranking** – Horizontal bars showing on-time payment percentage for each renter (green >80%, yellow 50-80%, red <50%)

5. **Revenue Forecast** – Line chart with actual revenue for the last 3 months and forecast for the next 3 months

6. **Overdue Seasonality** – Combined chart: paid payments (green bars) and overdue payments (red line) by month

7. **Overdue Payments Table** – Detailed table with object name, district, amount, days overdue, and status color (yellow <30 days, red >30 days)

### API Endpoints

1. **Get KPI Statistics** – `GET`  
   `http://localhost:3000/api/analytics/stats`  
   Returns total objects, leased objects, average rate, overdue amount, occupancy rate.

2. **Get District Revenue** – `GET`  
   `http://localhost:3000/api/analytics/districts`  
   Returns income data grouped by district.

3. **Get Top Objects** – `GET`  
   `http://localhost:3000/api/analytics/top-objects`  
   Returns the 5 most profitable properties.

4. **Get Overdue Payments** – `GET`  
   `http://localhost:3000/api/analytics/overdue`  
   Returns list of overdue payments with days overdue.

5. **Get Property Type Revenue** – `GET`  
   `http://localhost:3000/api/analytics/object-types`  
   Returns income distribution by property type.

6. **Get Renter Reliability** – `GET`  
   `http://localhost:3000/api/analytics/renter-reliability`  
   Returns reliability percentage for each renter.

7. **Get Revenue Forecast** – `GET`  
   `http://localhost:3000/api/analytics/forecast`  
   Returns forecasted revenue for the next 3 months.

8. **Get Overdue Seasonality** – `GET`  
   `http://localhost:3000/api/analytics/seasonality`  
   Returns overdue and paid payment counts by month.

# CHAPTER 3 – NOTIFICATIONS MODULE

## Email Notification System

This chapter implements automated email notifications for payment reminders and overdue alerts.

**Notification Types:**

- **upcoming** – Reminder of upcoming payment (1-3 days before due date) – yellow
- **today** – Payment due today – orange
- **overdue** – Overdue up to 30 days – red
- **critical** – Overdue more than 30 days – dark red
- **success** – Payment successfully received – green

**Scheduler:** The system checks for overdue payments every day at 9:00 AM and sends notifications automatically.

**Email Templates:** HTML emails with color coding, days-remaining counter, contract details, and payment amount.

### API Endpoints

1. **Manual Notification Trigger** – `POST`  
   `http://localhost:3000/api/notifications/check`  
   Manually triggers notification check and sending.

2. **Get Notifications List** – `GET`  
   `http://localhost:3000/api/notifications`  
   Returns the list of sent notifications.

# CHAPTER 4 – DATABASE STRUCTURE

## PostgreSQL Schema

**Tables:**

1. **статус** (status) – clsname (status name), clspaint (marker color)
2. **арендаторы** (renters) – name, phone, email, inn
3. **справочник*объектов*недвижимости** (real estate reference) – cadastral_number, name, address, object_type, total_area, width (latitude), length (longitude), status_id
4. **договор_аренды** (lease agreements) – object_id, rentor_id, contract_number, status_contract, date_start, date_end, date_pay, rent, rented_area
5. **платежи** (payments) – lease_id, sum, date_pay, status_pay
6. **уведомления** (notifications) – lease_id, notification_type, message, creation_date, status_notification, days_relative, due_date, sum

**Indexes:** Created on cadastral_number, date_pay, status_pay, lease_id for query optimization.

**Triggers:** Auto-update contract status when end date is reached.

# CHAPTER 5 – INSTALLATION AND LAUNCH

## Getting Started

**1. Install dependencies**

`npm install`

**2. Create PostgreSQL database**

`CREATE DATABASE immovables;`

Run the `database_setup.sql` script to create tables and populate with test data.

**3. Configure database connection**

In `server.js`, set your PostgreSQL credentials:

`const pool = new Pool({
  user: "postgres",
  host: "localhost",
  database: "immovables",
  password: "your_password",
  port: 5432,
});`

**4. Start the server**

`node server.js`

**5. Open in browser**

`http://localhost:3000`
