document.addEventListener("DOMContentLoaded", async function () {
  await loadStats();
  await loadDistrictChart();
  await loadTopObjectsChart();
  await loadOverdueTable();
});

async function loadStats() {
  try {
    const response = await fetch("/api/analytics/stats");
    const stats = await response.json();

    document.getElementById("totalObjects").textContent = stats.totalObjects;
    document.getElementById("rentedObjects").textContent = stats.rentedObjects;
    document.getElementById("avgRate").textContent =
      Math.round(stats.avgRate) + " ₽/м²";
    document.getElementById("overdueAmount").textContent =
      new Intl.NumberFormat("ru-RU").format(stats.overdueAmount) + " ₽";

    document.querySelector(".stat-card:nth-child(2) .stat-trend").textContent =
      Math.round(stats.occupancyRate) + "% заполняемость";
    document.querySelector(".stat-card:nth-child(4) .stat-trend").textContent =
      stats.overdueCount + " объектов";
  } catch (error) {
    console.error("Ошибка загрузки статистики:", error);
  }
}

async function loadDistrictChart() {
  try {
    const response = await fetch("/api/analytics/districts");
    const data = await response.json();

    if (data.length === 0) {
      document.querySelector(".chart-note").textContent =
        "Нет данных за период";
      return;
    }

    const districtCtx = document
      .getElementById("districtChart")
      .getContext("2d");
    new Chart(districtCtx, {
      type: "bar",
      data: {
        labels: data.map((item) => item.district),
        datasets: [
          {
            label: "Доход за месяц (тыс. ₽)",
            data: data.map((item) => Math.round(item.total_income / 1000)),
            backgroundColor: "#1E3A8A",
            borderRadius: 4,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: { display: false },
        },
        scales: {
          y: {
            beginAtZero: true,
            grid: { color: "#e0e0e0" },
          },
        },
      },
    });

    const topDistrict = data.reduce((max, item) =>
      item.total_income > max.total_income ? item : max,
    );
    document.querySelector(".chart-note").textContent =
      `${topDistrict.district} район лидирует по доходности`;
  } catch (error) {
    console.error("Ошибка загрузки данных районов:", error);
  }
}

async function loadTopObjectsChart() {
  try {
    const response = await fetch("/api/analytics/top-objects");
    const objects = await response.json();

    if (objects.length === 0) return;

    const topCtx = document.getElementById("topObjectsChart").getContext("2d");
    new Chart(topCtx, {
      type: "bar",
      data: {
        labels: objects.map((obj) => {
          const name = obj.name || "Без названия";
          return name.length > 15 ? name.substring(0, 12) + "..." : name;
        }),
        datasets: [
          {
            data: objects.map((obj) => Math.round(obj.total_income / 1000)),
            backgroundColor: "#10b981",
            borderRadius: 4,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (context) => {
                return context.raw + " тыс. ₽";
              },
            },
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            grid: { color: "#e0e0e0" },
          },
        },
      },
    });
  } catch (error) {
    console.error("Ошибка загрузки топа объектов:", error);
  }
}

async function loadOverdueTable() {
  try {
    const response = await fetch("/api/analytics/overdue");
    const overdue = await response.json();

    const tbody = document.getElementById("overdueTableBody");

    if (overdue.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align: center;">Нет просрочек</td></tr>`;
      return;
    }

    tbody.innerHTML = overdue
      .map((item) => {
        let badgeClass = "badge warning";
        let badgeText = "Просрочка";

        if (item.days_overdue > 30) {
          badgeClass = "badge critical";
          badgeText = "Критично";
        }

        return `
        <tr>
            <td>${item.object_name || "Не указано"}</td>
            <td>${item.district || "Не указан"}</td>
            <td>${new Intl.NumberFormat("ru-RU").format(item.overdue_sum)} ₽</td>
            <td>${Math.round(item.days_overdue)}</td>
            <td><span class="${badgeClass}">${badgeText}</span></td>
        </tr>
      `;
      })
      .join("");
  } catch (error) {
    console.error("Ошибка загрузки просрочек:", error);
  }
}
