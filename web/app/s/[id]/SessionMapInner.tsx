"use client";

import { useEffect, useRef } from "react";
import { CircleMarker, MapContainer, Polyline, TileLayer, useMap } from "react-leaflet";
import type { LatLngBoundsExpression } from "leaflet";

function FitBounds({ bounds }: { bounds: LatLngBoundsExpression }) {
  const map = useMap();
  const fitted = useRef(false);
  useEffect(() => {
    if (fitted.current) return;
    map.fitBounds(bounds, { padding: [24, 24] });
    fitted.current = true;
  }, [map, bounds]);
  return null;
}

export default function SessionMapInner({ points }: { points: [number, number][] }) {
  const start = points[0]!;
  const end = points[points.length - 1]!;
  const bounds: LatLngBoundsExpression = points;

  return (
    <MapContainer center={start} zoom={14} scrollWheelZoom={false} style={{ height: "100%" }}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Polyline positions={points} pathOptions={{ color: "#3b82f6", weight: 4 }} />
      <CircleMarker center={start} radius={6} pathOptions={{ color: "#22c55e", fillColor: "#22c55e", fillOpacity: 1 }} />
      <CircleMarker center={end} radius={6} pathOptions={{ color: "#ef4444", fillColor: "#ef4444", fillOpacity: 1 }} />
      <FitBounds bounds={bounds} />
    </MapContainer>
  );
}
