document.addEventListener("DOMContentLoaded", async function () {
  await loadStats();
  await loadDistrictChart();
  await loadTopObjectsChart();
  await loadOverdueTable();
  await loadObjectTypesChart();
  await loadRenterReliabilityChart();
  await loadForecastChart();
  await loadSeasonalityChart();
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
    document.getElementById("occupancyText").textContent =
      Math.round(stats.occupancyRate) + "% заполняемость";
    document.getElementById("overdueCount").textContent =
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
      document.getElementById("districtNote").textContent =
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
    document.getElementById("districtNote").textContent =
      `${topDistrict.district} район лидирует по доходности`;
  } catch (error) {
    console.error("Ошибка загрузки данных районов:", error);
    document.getElementById("districtNote").textContent =
      "Ошибка загрузки данных";
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

async function loadObjectTypesChart() {
  try {
    const response = await fetch("/api/analytics/object-types");
    const data = await response.json();

    if (data.length === 0) {
      document.getElementById("objectTypesChart").parentElement.innerHTML =
        '<p style="text-align: center; color: #666;">Нет данных</p>';
      return;
    }

    const formatLegendText = (label, value) => {
      const base = `${label} - ${value} млн ₽`;
      const maxLength = 30;

      if (base.length <= maxLength) {
        return base;
      }

      const words = base.split(" ");
      const lines = [];
      let currentLine = "";

      for (const word of words) {
        const testLine = currentLine ? currentLine + " " + word : word;
        if (testLine.length > maxLength) {
          if (currentLine) {
            lines.push(currentLine);
          }
          currentLine = word;
        } else {
          currentLine = testLine;
        }
      }

      if (currentLine) {
        lines.push(currentLine);
      }

      return lines;
    };

    const ctx = document.getElementById("objectTypesChart").getContext("2d");
    new Chart(ctx, {
      type: "doughnut",
      data: {
        labels: data.map((item) => item.object_type),
        datasets: [
          {
            data: data.map((item) => Math.round(item.total_income / 1000000)),
            backgroundColor: [
              "#1E3A8A", // Детские сады - синий
              "#10b981", // Школы - зеленый
              "#f59e0b", // Офисы - оранжевый
              "#ef4444", // Помещения - красный
              "#8b5cf6", // Сооружения - фиолетовый
              "#ec4899", // Другое - розовый
            ],
            borderWidth: 0,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "60%",
        plugins: {
          legend: {
            position: "right",
            align: "center",
            labels: {
              font: { size: 13, weight: "500" },
              padding: 12,
              usePointStyle: true,
              pointStyle: "circle",
              boxWidth: 10,
              boxHeight: 10,
              generateLabels: (chart) => {
                const data = chart.data;
                const dataset = data.datasets[0];
                return data.labels.map((label, i) => ({
                  text: formatLegendText(label, dataset.data[i]),
                  fillStyle: dataset.backgroundColor[i],
                  strokeStyle: "transparent",
                  lineWidth: 0,
                  hidden: false,
                  index: i,
                }));
              },
            },
          },
          tooltip: {
            enabled: true,
            callbacks: {
              label: (context) => {
                return context.raw + " млн ₽";
              },
            },
          },
        },
      },
    });
  } catch (error) {
    console.error("Ошибка загрузки типов объектов:", error);
    document.getElementById("objectTypesChart").parentElement.innerHTML =
      '<p style="text-align: center; color: #ef4444;">Ошибка загрузки</p>';
  }
}

async function loadRenterReliabilityChart() {
  try {
    const response = await fetch("/api/analytics/renter-reliability");
    const data = await response.json();

    if (data.length === 0) return;

    const ctx = document
      .getElementById("renterReliabilityChart")
      .getContext("2d");
    new Chart(ctx, {
      type: "bar",
      data: {
        labels: data.map((item) => {
          const name = item.renter_name || "Неизвестно";
          return name.length > 12 ? name.substring(0, 10) + "..." : name;
        }),
        datasets: [
          {
            label: "Надежность (%)",
            data: data.map((item) => item.reliability_percent),
            backgroundColor: data.map((item) =>
              item.reliability_percent > 80
                ? "#10b981"
                : item.reliability_percent > 50
                  ? "#f59e0b"
                  : "#ef4444",
            ),
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
                return context.raw + "% платежей вовремя";
              },
            },
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            max: 100,
            grid: { color: "#e0e0e0" },
          },
        },
      },
    });
  } catch (error) {
    console.error("Ошибка загрузки надежности арендаторов:", error);
  }
}

async function loadForecastChart() {
  try {
    const response = await fetch("/api/analytics/forecast");
    const data = await response.json();

    if (data.length === 0) return;

    const ctx = document.getElementById("forecastChart").getContext("2d");
    new Chart(ctx, {
      type: "line",
      data: {
        labels: data.map((item) => item.month),
        datasets: [
          {
            label: "Фактические доходы",
            data: data.map((item) => item.actual / 1000),
            borderColor: "#1E3A8A",
            backgroundColor: "rgba(30, 58, 138, 0.1)",
            borderWidth: 4,
            tension: 0.3,
            pointBackgroundColor: "#1E3A8A",
            pointRadius: 6,
            pointHoverRadius: 8,
            fill: false,
          },
          {
            label: "Прогноз",
            data: data.map((item) => item.forecast / 1000),
            borderColor: "#f59e0b",
            backgroundColor: "transparent",
            borderWidth: 4,
            borderDash: [8, 4],
            tension: 0.3,
            pointBackgroundColor: "#f59e0b",
            pointRadius: 6,
            pointHoverRadius: 8,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: {
            position: "top",
            labels: {
              font: { size: 12, weight: "bold" },
              usePointStyle: true,
              pointStyle: "circle",
            },
          },
          tooltip: {
            backgroundColor: "white",
            titleColor: "#1E3A8A",
            bodyColor: "#333",
            borderColor: "#e0e0e0",
            borderWidth: 1,
            callbacks: {
              label: (context) => {
                return context.dataset.label + ": " + context.raw + " млн ₽";
              },
            },
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            grid: { color: "#e0e0e0", drawBorder: false },
            title: {
              display: true,
              text: "млн рублей",
              color: "#666",
              font: { size: 11 },
            },
            ticks: {
              callback: (value) => value + " млн",
            },
          },
          x: {
            grid: { display: false },
            ticks: {
              font: { size: 11, weight: "bold" },
              color: "#333",
            },
          },
        },
      },
    });

    const totalForecast = data.reduce(
      (sum, item) => sum + (item.forecast || 0),
      0,
    );
    document.getElementById("forecastNote").textContent =
      `💰 Прогноз на 3 месяца: ${Math.round(totalForecast / 1000)} млн ₽`;
  } catch (error) {
    console.error("Ошибка загрузки прогноза:", error);
  }
}

async function loadSeasonalityChart() {
  try {
    const response = await fetch("/api/analytics/seasonality");
    const data = await response.json();

    if (data.length === 0) return;

    const ctx = document.getElementById("seasonalityChart").getContext("2d");
    new Chart(ctx, {
      type: "line",
      data: {
        labels: data.map((item) => item.month),
        datasets: [
          {
            label: "Оплаты",
            data: data.map((item) => item.paid_count),
            borderColor: "#10b981",
            backgroundColor: "rgba(16, 185, 129, 0.1)",
            borderWidth: 4,
            tension: 0.4,
            pointBackgroundColor: "#10b981",
            pointRadius: 5,
            pointHoverRadius: 7,
            fill: true,
          },
          {
            label: "Просрочки",
            data: data.map((item) => item.overdue_count),
            borderColor: "#ef4444",
            backgroundColor: "rgba(239, 68, 68, 0.1)",
            borderWidth: 4,
            tension: 0.4,
            pointBackgroundColor: "#ef4444",
            pointRadius: 5,
            pointHoverRadius: 7,
            fill: true,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: {
            position: "top",
            labels: {
              font: { size: 12, weight: "bold" },
              usePointStyle: true,
              pointStyle: "circle",
            },
          },
          tooltip: {
            backgroundColor: "white",
            titleColor: "#1E3A8A",
            bodyColor: "#333",
            borderColor: "#e0e0e0",
            borderWidth: 1,
            callbacks: {
              label: (context) => {
                return context.dataset.label + ": " + context.raw + " шт";
              },
            },
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            grid: { color: "#e0e0e0", drawBorder: false },
            title: {
              display: true,
              text: "количество платежей",
              color: "#666",
              font: { size: 11 },
            },
            ticks: {
              stepSize: 5,
            },
          },
          x: {
            grid: { display: false },
            ticks: {
              font: { size: 11, weight: "bold" },
              color: "#333",
            },
          },
        },
      },
    });
  } catch (error) {
    console.error("Ошибка загрузки сезонности:", error);
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
