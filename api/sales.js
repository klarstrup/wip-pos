import { Meteor } from "meteor/meteor";
import { Mongo } from "meteor/mongo";
import Products from "./products";

const Sales = new Mongo.Collection("sales");

if (Meteor.isServer)
  Meteor.startup(() => {
    if (Sales.find().count() === 0) {
      Sales.insert({ products: [{ _id: "blahh", name: "some rodut" }] });
    }
  });

Meteor.methods({
  "Sales.sellProducts"({ productIds }) {
    const { userId } = this;
    const newSale = {
      userId,
      currency: "HAX",
      country: "DK",
      amount: 0,
      timestamp: new Date(),
      products: productIds.map(_id => Products.find({ _id }).fetch()),
    };
    console.log(this, newSale);
    return Sales.insert(newSale);
  },
});

export default Sales;

if (Meteor.isClient) window.Sales = Sales;
