var kemerovoCenter = [55.355, 86.087];

var map = L.map("map", {
  attributionControl: false,
  zoomControl: false,
}).setView(kemerovoCenter, 12);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "",
}).addTo(map);

L.control
  .zoom({
    position: "topright",
  })
  .addTo(map);

function getMarkerColor(paint) {
  const colors = {
    Зеленый: "#10b981",
    Красный: "#ef4444",
    Синий: "#1E3A8A",
    Серый: "#6b7280",
    Желтый: "#f59e0b",
  };
  return colors[paint] || "#1E3A8A";
}

function createColoredMarker(color) {
  return L.divIcon({
    className: "custom-marker",
    html: `<div style="
      width: 20px;
      height: 20px;
      background-color: ${color};
      border-radius: 50%;
      border: 3px solid white;
      box-shadow: 0 2px 5px rgba(0,0,0,0.3);
      cursor: pointer;
    "></div>`,
    iconSize: [26, 26],
    popupAnchor: [0, -13],
  });
}

function formatDate(dateString) {
  if (!dateString) return "Не указана";
  const date = new Date(dateString);
  return date.toLocaleDateString("ru-RU");
}

function formatSum(sum) {
  return new Intl.NumberFormat("ru-RU").format(sum) + " ₽";
}

function getPaymentStatusColor(status) {
  const colors = {
    Оплачен: "#10b981",
    Просрочен: "#ef4444",
    Ожидается: "#f59e0b",
  };
  return colors[status] || "#6b7280";
}

async function loadContractInfo(objectId, popupElement) {
  try {
    const response = await fetch(`/api/contracts/${objectId}`);
    const contracts = await response.json();

    if (contracts.length === 0) {
      popupElement.innerHTML +=
        '<div style="color: #666; margin-top: 10px;">Нет активных договоров</div>';
      return;
    }

    let contractsHtml =
      '<div style="margin-top: 15px; border-top: 2px solid #e0e0e0; padding-top: 10px;">';
    contractsHtml +=
      '<div style="font-weight: 600; color: #1E3A8A; margin-bottom: 8px;">📄 Договоры аренды:</div>';

    for (const contract of contracts) {
      const paymentsResponse = await fetch(
        `/api/payments/${contract.lease_id}`,
      );
      const payments = await paymentsResponse.json();

      const contractStatusColor =
        contract.status_contract === "Активный" ? "#10b981" : "#ef4444";

      contractsHtml += `
        <div style="
          background: #f8f9fa;
          border-radius: 8px;
          padding: 12px;
          margin-bottom: 12px;
          border-left: 3px solid ${contractStatusColor};
        ">
          <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
            <span style="font-weight: 500;">№ ${contract.contract_number || "Не указан"}</span>
            <span style="
              background: ${contractStatusColor}20;
              color: ${contractStatusColor};
              padding: 2px 8px;
              border-radius: 12px;
              font-size: 11px;
              font-weight: 500;
            ">${contract.status_contract || "Не указан"}</span>
          </div>
          
          <div style="font-size: 12px; color: #666; margin-bottom: 5px;">
            📅 ${formatDate(contract.date_start)} - ${formatDate(contract.date_end)}
          </div>
          
          <div style="font-size: 12px; margin-bottom: 8px;">
            <span style="color: #666;">Площадь:</span> ${contract.rented_area || "0"} м²<br>
            <span style="color: #666;">Арендная плата:</span> ${formatSum(contract.rent)}/мес
          </div>
      `;

      if (payments.length > 0) {
        contractsHtml += `
          <div style="margin-top: 8px;">
            <div style="font-size: 11px; font-weight: 500; color: #666; margin-bottom: 5px;">💰 Последние платежи:</div>
        `;

        payments.slice(0, 3).forEach((payment) => {
          const paymentColor = getPaymentStatusColor(payment.status_pay);
          contractsHtml += `
            <div style="
              display: flex;
              justify-content: space-between;
              align-items: center;
              font-size: 11px;
              padding: 3px 0;
              border-bottom: 1px dashed #e0e0e0;
            ">
              <span>${formatDate(payment.date_pay)}</span>
              <span style="font-weight: 500;">${formatSum(payment.sum)}</span>
              <span style="
                background: ${paymentColor}20;
                color: ${paymentColor};
                padding: 1px 6px;
                border-radius: 10px;
                font-size: 10px;
              ">${payment.status_pay}</span>
            </div>
          `;
        });

        contractsHtml += "</div>";
      }

      contractsHtml += `
        <div style="margin-top: 8px;">
          <button onclick="downloadContract(${contract.lease_id})" style="
            background: #1E3A8A;
            color: white;
            border: none;
            border-radius: 4px;
            padding: 4px 8px;
            font-size: 11px;
            cursor: pointer;
          ">
            📥 Скачать договор
          </button>
        </div>
      `;

      contractsHtml += "</div>";
    }

    contractsHtml += `
      <div style="margin-top: 10px; text-align: center;">
        <button onclick="showAllPayments(${objectId})" style="
          background: none;
          border: 1px solid #1E3A8A;
          color: #1E3A8A;
          border-radius: 4px;
          padding: 5px 10px;
          font-size: 12px;
          cursor: pointer;
        ">
          📊 Показать историю всех платежей
        </button>
      </div>
    `;

    popupElement.innerHTML += contractsHtml;
  } catch (error) {
    console.error("Ошибка загрузки договоров:", error);
    popupElement.innerHTML +=
      '<div style="color: #ef4444; margin-top: 10px;">Ошибка загрузки данных</div>';
  }
}

window.downloadContract = function (leaseId) {
  window.open(`/api/download-contract/${leaseId}`, "_blank");
};

window.showAllPayments = async function (objectId) {
  try {
    const response = await fetch(`/api/contracts/${objectId}`);
    const contracts = await response.json();

    let allPayments = [];
    for (const contract of contracts) {
      const paymentsResponse = await fetch(
        `/api/payments/${contract.lease_id}`,
      );
      const payments = await paymentsResponse.json();
      allPayments = [
        ...allPayments,
        ...payments.map((p) => ({
          ...p,
          contract_number: contract.contract_number,
        })),
      ];
    }

    allPayments.sort((a, b) => new Date(b.date_pay) - new Date(a.date_pay));

    const modal = document.createElement("div");
    modal.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: white;
      padding: 20px;
      border-radius: 12px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.2);
      z-index: 2000;
      max-width: 600px;
      max-height: 80vh;
      overflow-y: auto;
    `;

    let paymentsHtml = `
      <div style="font-size: 18px; font-weight: 600; color: #1E3A8A; margin-bottom: 15px;">
        📊 История всех платежей
      </div>
    `;

    if (allPayments.length === 0) {
      paymentsHtml +=
        '<div style="color: #666; text-align: center;">Нет платежей</div>';
    } else {
      allPayments.forEach((payment) => {
        const paymentColor = getPaymentStatusColor(payment.status_pay);
        paymentsHtml += `
          <div style="
            background: #f8f9fa;
            border-radius: 8px;
            padding: 10px;
            margin-bottom: 8px;
            border-left: 3px solid ${paymentColor};
          ">
            <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
              <span style="font-weight: 500;">Договор №${payment.contract_number || "Не указан"}</span>
              <span style="
                background: ${paymentColor}20;
                color: ${paymentColor};
                padding: 2px 8px;
                border-radius: 12px;
                font-size: 11px;
              ">${payment.status_pay}</span>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 13px;">
              <span>📅 ${formatDate(payment.date_pay)}</span>
              <span style="font-weight: 600;">${formatSum(payment.sum)}</span>
            </div>
          </div>
        `;
      });
    }

    paymentsHtml += `
      <div style="margin-top: 15px; text-align: right;">
        <button onclick="this.parentElement.parentElement.remove(); document.querySelector('.modal-overlay').remove()" style="
          background: #1E3A8A;
          color: white;
          border: none;
          border-radius: 6px;
          padding: 8px 16px;
          cursor: pointer;
        ">Закрыть</button>
      </div>
    `;

    modal.innerHTML = paymentsHtml;
    document.body.appendChild(modal);

    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0,0,0,0.5);
      z-index: 1999;
    `;
    overlay.onclick = () => {
      modal.remove();
      overlay.remove();
    };
    document.body.appendChild(overlay);
  } catch (error) {
    console.error("Ошибка загрузки платежей:", error);
    alert("Ошибка загрузки платежей");
  }
};

fetch("/api/coordinates")
  .then((response) => {
    if (!response.ok) {
      throw new Error("Ошибка HTTP: " + response.status);
    }
    return response.json();
  })
  .then((objects) => {
    objects.forEach((obj) => {
      if (obj.width && obj.length) {
        const markerColor = getMarkerColor(obj.clspaint);

        var marker = L.marker([parseFloat(obj.width), parseFloat(obj.length)], {
          icon: createColoredMarker(markerColor),
        }).addTo(map);

        var popupContent = document.createElement("div");
        popupContent.className = "popup-content";
        popupContent.style.cssText = `
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          font-size: 14px;
          line-height: 1.5;
          padding: 16px;
        `;

        popupContent.innerHTML = `
          <div style="
            font-weight: 600;
            color: #1E3A8A;
            border-bottom: 2px solid #e0e0e0;
            padding-bottom: 8px;
            margin-bottom: 12px;
            font-size: 16px;
            position: sticky;
            top: 0;
            background: white;
            z-index: 10;
          ">${obj.name || "Объект недвижимости"}</div>
          
          <div style="margin-bottom: 8px;">
            <div style="color: #666; font-size: 12px;">📋 Кадастровый номер:</div>
            <div style="font-weight: 500;">${obj.cadastral_number || "Не указан"}</div>
          </div>
          
          <div style="margin-bottom: 8px;">
            <div style="color: #666; font-size: 12px;">📍 Адрес:</div>
            <div style="font-weight: 500;">${obj.address || "Не указан"}</div>
          </div>
          
          <div style="margin-bottom: 12px;">
            <div style="color: #666; font-size: 12px;">📌 Статус:</div>
            <span style="
              display: inline-block;
              padding: 4px 12px;
              background-color: ${markerColor}20;
              color: ${markerColor};
              border-radius: 16px;
              font-size: 13px;
              font-weight: 500;
              margin-top: 4px;
            ">${obj.clsname || "Не указан"}</span>
          </div>
          
          <div id="contracts-${obj.objectestate_id}" style="margin-top: 15px;"></div>
        `;

        marker.bindPopup(popupContent, {
          maxHeight: 600,
          maxWidth: 500,
          minWidth: 400,
          className: "custom-popup",
        });

        marker.on("popupopen", function () {
          const contractsDiv = document.getElementById(
            `contracts-${obj.objectestate_id}`,
          );
          if (contractsDiv) {
            loadContractInfo(obj.objectestate_id, contractsDiv);
          }
        });
      }
    });
  })
  .catch((error) => {
    console.error("Ошибка загрузки данных:", error);
  });
