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
    "></div>`,
    iconSize: [26, 26],
    popupAnchor: [0, -13],
  });
}

fetch("/api/coordinates")
  .then((response) => {
    if (!response.ok) {
      throw new Error("Ошибка HTTP: " + response.status);
    }
    return response.json();
  })
  .then((objects) => {
    console.log("Получены объекты:", objects);

    objects.forEach((obj) => {
      if (obj.width && obj.length) {
        const markerColor = getMarkerColor(obj.clspaint);

        var marker = L.marker([parseFloat(obj.width), parseFloat(obj.length)], {
          icon: createColoredMarker(markerColor),
        }).addTo(map);

        var popupContent = `
          <div style="
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-size: 14px;
            line-height: 1.5;
            min-width: 250px;
            padding: 8px;
          ">
            <div style="
              font-weight: 600;
              color: #1E3A8A;
              border-bottom: 1px solid #e0e0e0;
              padding-bottom: 5px;
              margin-bottom: 8px;
              font-size: 15px;
            ">${obj.name || "Объект недвижимости"}</div>
            
            <div style="margin-bottom: 5px;">
              <span style="color: #666; font-size: 12px;">Кадастровый номер:</span><br>
              <span style="font-weight: 500;">${
                obj.cadastral_number || "Не указан"
              }</span>
            </div>
            
            <div style="margin-bottom: 5px;">
              <span style="color: #666; font-size: 12px;">Адрес:</span><br>
              <span style="font-weight: 500;">${
                obj.address || "Не указан"
              }</span>
            </div>
            
            <div style="margin-bottom: 5px;">
              <span style="color: #666; font-size: 12px;">Статус:</span><br>
              <span style="
                font-weight: 500;
                color: ${markerColor};
                display: inline-block;
                padding: 2px 8px;
                background-color: ${markerColor}20;
                border-radius: 12px;
                font-size: 12px;
              ">${obj.clsname || "Не указан"}</span>
            </div>
            
            <div style="margin-top: 8px; color: #888; font-size: 11px; border-top: 1px solid #e0e0e0; padding-top: 5px;">
              Координаты: ${parseFloat(obj.width).toFixed(5)}, ${parseFloat(
          obj.length
        ).toFixed(5)}
            </div>
          </div>
        `;
        marker.bindPopup(popupContent);
      }
    });

    console.log("Загружено объектов:", objects.length);
  })
  .catch((error) => {
    console.error("Ошибка загрузки данных:", error);
  });
