import React from "react";
import { Layer, Rectangle, Sankey, Tooltip } from "recharts";
import { useTracker } from "meteor/react-meteor-data";
import Products from "../api/products";
import Sales from "../api/sales";
import Camps from "../api/camps";

function DemoSankeyNode({
  x,
  y,
  width,
  height,
  index,
  payload,
  containerWidth,
}) {
  const isOut = x + width + 6 > containerWidth;
  return (
    <Layer key={`CustomNode${index}`}>
      <Rectangle
        x={x}
        y={y}
        width={width}
        height={height}
        fill="#5192ca"
        fillOpacity="1"
      />
      <text
        textAnchor={isOut ? "end" : "start"}
        x={isOut ? x - 6 : x + width + 6}
        y={y + height / 2}
        fontSize="14"
        stroke="#FFED00"
      >
        {payload.name}
      </text>
      <text
        textAnchor={isOut ? "end" : "start"}
        x={isOut ? x - 6 : x + width + 6}
        y={y + height / 2 + 13}
        fontSize="12"
        stroke="#FFED00"
        strokeOpacity="0.5"
      >
        {payload.value} units
      </text>
    </Layer>
  );
}

export default function SalesSankey() {
  const data = useTracker(() => {
    const [currentCamp] = Camps.find({}, { sort: { end: -1 } }).fetch();
    const sales = Sales.find({
      timestamp: { $gte: currentCamp?.start, $lte: currentCamp?.end },
    }).fetch();
    const productsSold = sales.reduce((memo, sale) => {
      memo.push(...sale.products.map(({ _id }) => Products.findOne(_id)));
      return memo;
    }, []);
    const data0 = {
      nodes: [
        { name: "Bar Sales" },
        { name: "Alcoholic" },
        { name: "Beer" },
        { name: "Non-Beer" },
        { name: "Non-Alcoholic" },
        { name: "Mate" },
        { name: "Non-Mate" },
      ],
      links: [
        {
          source: 0,
          target: 1,
          value: productsSold.filter(
            ({ tags }) =>
              tags.includes("cocktail") ||
              tags.includes("spirit") ||
              tags.includes("cider") ||
              tags.includes("beer"),
          ).length,
        }, // Alcoholic
        {
          source: 1,
          target: 2,
          value: productsSold.filter(({ tags }) => tags.includes("beer"))
            .length,
        }, // Beer
        {
          source: 1,
          target: 3,
          value: productsSold.filter(
            ({ tags }) =>
              tags.includes("cocktail") ||
              tags.includes("spirit") ||
              tags.includes("cider"),
          ).length,
        }, // Non-beer
        {
          source: 0,
          target: 4,
          value: productsSold.filter(
            ({ tags }) =>
              !(
                tags.includes("cocktail") ||
                tags.includes("spirit") ||
                tags.includes("cider") ||
                tags.includes("beer")
              ),
          ).length,
        }, // Non-alcoholic
        {
          source: 4,
          target: 5,
          value: productsSold.filter(
            ({ name, tags }) =>
              !(
                tags.includes("cocktail") ||
                tags.includes("spirit") ||
                tags.includes("cider") ||
                tags.includes("beer")
              ) && name === "Mate",
          ).length,
        }, // Mate
        {
          source: 4,
          target: 6,
          value: productsSold.filter(
            ({ name, tags }) =>
              !(
                tags.includes("cocktail") ||
                tags.includes("spirit") ||
                tags.includes("cider") ||
                tags.includes("beer")
              ) && name !== "Mate",
          ).length,
        }, // Non-mate
      ],
    };

    return data0;
  }, []);
  if (!data) return "Loading...";
  return (
    <Sankey
      width={900}
      height={350}
      data={data}
      nodePading={50}
      margin={{
        left: 100,
        right: 100,
        bottom: 25,
      }}
      link={{ stroke: "#77c878" }}
      node={<DemoSankeyNode />}
    >
      <Tooltip />
    </Sankey>
  );
}
