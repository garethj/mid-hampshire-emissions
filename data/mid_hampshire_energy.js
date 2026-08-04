window.MHE_ENERGY_DATA = {
 "meta": {
  "source_renewable": "DESNZ Regional renewable statistics \u2014 renewable electricity by local authority",
  "source_renewable_url": "https://www.gov.uk/government/statistics/regional-renewable-statistics",
  "source_consumption": "DESNZ Total final energy consumption at regional and local authority level",
  "source_consumption_url": "https://www.gov.uk/government/collections/total-final-energy-consumption-at-sub-national-level",
  "units": "MWh",
  "generation_years": [
   2014,
   2015,
   2016,
   2017,
   2018,
   2019,
   2020,
   2021,
   2022,
   2023,
   2024
  ],
  "consumption_years": [
   2005,
   2006,
   2007,
   2008,
   2009,
   2010,
   2011,
   2012,
   2013,
   2014,
   2015,
   2016,
   2017,
   2018,
   2019,
   2020,
   2021,
   2022,
   2023,
   2024
  ],
  "technology_groups": [
   "Solar",
   "Wind",
   "Hydro",
   "Bioenergy & waste",
   "Other"
  ],
  "note_boundary": "Same Mid-Hampshire / Hampshire and the Solent constituent local authorities and Mid-Hampshire population-based retained fractions as mid_hampshire_emissions.json \u2014 see that file's note_boundary for the full explanation.",
  "note_suppression": "DESNZ suppresses some small per-technology generation cells (marked \"[X]\" in the source workbook) to avoid revealing individual plants' output. This site treats suppressed cells as 0 for their own technology group and adds the (small) gap between the visible columns and DESNZ's own published Total into the \"Other\" group, so technology totals always sum exactly to DESNZ's published local authority total.",
  "note_ktoe_conversion": "Electricity consumption is published in ktoe (kilotonnes of oil equivalent) and converted here to MWh using the standard DUKES/IEA factor of 1 toe = 11.63 MWh.",
  "generated": "2026-08-04"
 },
 "regions": {
  "winchester": {
   "name": "Winchester",
   "generation": {
    "2014": {
     "total_mwh": 23594.85,
     "by_technology_mwh": {
      "Solar": 23488.166,
      "Wind": 79.049,
      "Hydro": 27.635,
      "Bioenergy & waste": 0.0,
      "Other": 0.0
     }
    },
    "2015": {
     "total_mwh": 69453.372,
     "by_technology_mwh": {
      "Solar": 69331.147,
      "Wind": 90.131,
      "Hydro": 32.093,
      "Bioenergy & waste": 0.0,
      "Other": 0.001
     }
    },
    "2016": {
     "total_mwh": 79966.552,
     "by_technology_mwh": {
      "Solar": 79818.288,
      "Wind": 71.619,
      "Hydro": 76.645,
      "Bioenergy & waste": 0.0,
      "Other": 0.0
     }
    },
    "2017": {
     "total_mwh": 86650.401,
     "by_technology_mwh": {
      "Solar": 85564.965,
      "Wind": 80.05,
      "Hydro": 107.05,
      "Bioenergy & waste": 898.336,
      "Other": 0.0
     }
    },
    "2018": {
     "total_mwh": 93678.45,
     "by_technology_mwh": {
      "Solar": 92064.685,
      "Wind": 75.172,
      "Hydro": 114.959,
      "Bioenergy & waste": 1423.634,
      "Other": 0.0
     }
    },
    "2019": {
     "total_mwh": 91813.22,
     "by_technology_mwh": {
      "Solar": 91678.104,
      "Wind": 0.0,
      "Hydro": 135.116,
      "Bioenergy & waste": 0.0,
      "Other": 0.0
     }
    },
    "2020": {
     "total_mwh": 92599.112,
     "by_technology_mwh": {
      "Solar": 92451.984,
      "Wind": 0.0,
      "Hydro": 147.128,
      "Bioenergy & waste": 0.0,
      "Other": 0.0
     }
    },
    "2021": {
     "total_mwh": 88036.423,
     "by_technology_mwh": {
      "Solar": 87917.632,
      "Wind": 0.0,
      "Hydro": 118.791,
      "Bioenergy & waste": 0.0,
      "Other": 0.0
     }
    },
    "2022": {
     "total_mwh": 96353.489,
     "by_technology_mwh": {
      "Solar": 96268.244,
      "Wind": 0.0,
      "Hydro": 85.245,
      "Bioenergy & waste": 0.0,
      "Other": 0.0
     }
    },
    "2023": {
     "total_mwh": 93096.857,
     "by_technology_mwh": {
      "Solar": 92985.507,
      "Wind": 0.0,
      "Hydro": 111.35,
      "Bioenergy & waste": 0.0,
      "Other": 0.0
     }
    },
    "2024": {
     "total_mwh": 116967.476,
     "by_technology_mwh": {
      "Solar": 116833.18,
      "Wind": 0.0,
      "Hydro": 134.296,
      "Bioenergy & waste": 0.0,
      "Other": 0.0
     }
    }
   },
   "consumption": {
    "2005": {
     "electricity_consumption_mwh": 651547.49
    },
    "2006": {
     "electricity_consumption_mwh": 641894.59
    },
    "2007": {
     "electricity_consumption_mwh": 640824.63
    },
    "2008": {
     "electricity_consumption_mwh": 652722.12
    },
    "2009": {
     "electricity_consumption_mwh": 658831.527
    },
    "2010": {
     "electricity_consumption_mwh": 664138.429
    },
    "2011": {
     "electricity_consumption_mwh": 649373.109
    },
    "2012": {
     "electricity_consumption_mwh": 647393.754
    },
    "2013": {
     "electricity_consumption_mwh": 640020.452
    },
    "2014": {
     "electricity_consumption_mwh": 635927.909
    },
    "2015": {
     "electricity_consumption_mwh": 617440.43
    },
    "2016": {
     "electricity_consumption_mwh": 593976.624
    },
    "2017": {
     "electricity_consumption_mwh": 597938.538
    },
    "2018": {
     "electricity_consumption_mwh": 595206.726
    },
    "2019": {
     "electricity_consumption_mwh": 584146.301
    },
    "2020": {
     "electricity_consumption_mwh": 555838.562
    },
    "2021": {
     "electricity_consumption_mwh": 559596.313
    },
    "2022": {
     "electricity_consumption_mwh": 549481.201
    },
    "2023": {
     "electricity_consumption_mwh": 555606.75
    },
    "2024": {
     "electricity_consumption_mwh": 560248.718
    }
   }
  },
  "mid-hampshire": {
   "name": "Mid-Hampshire (proposed)",
   "generation": {
    "2014": {
     "total_mwh": 128723.237,
     "by_technology_mwh": {
      "Solar": 89479.382,
      "Wind": 1122.79,
      "Hydro": 36.114,
      "Bioenergy & waste": 38084.95,
      "Other": 0.001
     }
    },
    "2015": {
     "total_mwh": 241243.017,
     "by_technology_mwh": {
      "Solar": 160093.268,
      "Wind": 168.549,
      "Hydro": 40.013,
      "Bioenergy & waste": 80941.184,
      "Other": 0.002
     }
    },
    "2016": {
     "total_mwh": 298727.903,
     "by_technology_mwh": {
      "Solar": 265792.944,
      "Wind": 133.931,
      "Hydro": 83.53,
      "Bioenergy & waste": 32717.498,
      "Other": 0.0
     }
    },
    "2017": {
     "total_mwh": 323526.245,
     "by_technology_mwh": {
      "Solar": 294098.117,
      "Wind": 149.697,
      "Hydro": 114.843,
      "Bioenergy & waste": 29163.587,
      "Other": 0.001
     }
    },
    "2018": {
     "total_mwh": 356891.423,
     "by_technology_mwh": {
      "Solar": 322943.06,
      "Wind": 140.576,
      "Hydro": 121.792,
      "Bioenergy & waste": 33685.996,
      "Other": 0.001
     }
    },
    "2019": {
     "total_mwh": 338322.567,
     "by_technology_mwh": {
      "Solar": 316928.289,
      "Wind": 42.475,
      "Hydro": 132.042,
      "Bioenergy & waste": 21219.76,
      "Other": 0.0
     }
    },
    "2020": {
     "total_mwh": 347207.061,
     "by_technology_mwh": {
      "Solar": 325790.7,
      "Wind": 50.304,
      "Hydro": 143.781,
      "Bioenergy & waste": 21222.277,
      "Other": 0.0
     }
    },
    "2021": {
     "total_mwh": 318177.942,
     "by_technology_mwh": {
      "Solar": 297864.443,
      "Wind": 38.342,
      "Hydro": 116.089,
      "Bioenergy & waste": 20159.069,
      "Other": 0.0
     }
    },
    "2022": {
     "total_mwh": 341147.789,
     "by_technology_mwh": {
      "Solar": 323559.22,
      "Wind": 29.402,
      "Hydro": 83.306,
      "Bioenergy & waste": 17475.861,
      "Other": 0.0
     }
    },
    "2023": {
     "total_mwh": 335736.123,
     "by_technology_mwh": {
      "Solar": 317985.055,
      "Wind": 31.634,
      "Hydro": 108.817,
      "Bioenergy & waste": 17610.616,
      "Other": 0.0
     }
    },
    "2024": {
     "total_mwh": 350924.164,
     "by_technology_mwh": {
      "Solar": 335193.255,
      "Wind": 30.779,
      "Hydro": 131.242,
      "Bioenergy & waste": 15568.888,
      "Other": 0.0
     }
    }
   },
   "consumption": {
    "2005": {
     "electricity_consumption_mwh": 2095489.603
    },
    "2006": {
     "electricity_consumption_mwh": 2041739.948
    },
    "2007": {
     "electricity_consumption_mwh": 2018206.514
    },
    "2008": {
     "electricity_consumption_mwh": 2021237.61
    },
    "2009": {
     "electricity_consumption_mwh": 2012985.608
    },
    "2010": {
     "electricity_consumption_mwh": 2014748.504
    },
    "2011": {
     "electricity_consumption_mwh": 1991237.648
    },
    "2012": {
     "electricity_consumption_mwh": 1994808.373
    },
    "2013": {
     "electricity_consumption_mwh": 1984468.426
    },
    "2014": {
     "electricity_consumption_mwh": 1995127.439
    },
    "2015": {
     "electricity_consumption_mwh": 1949730.509
    },
    "2016": {
     "electricity_consumption_mwh": 1884209.483
    },
    "2017": {
     "electricity_consumption_mwh": 1913845.892
    },
    "2018": {
     "electricity_consumption_mwh": 1904055.136
    },
    "2019": {
     "electricity_consumption_mwh": 1875684.049
    },
    "2020": {
     "electricity_consumption_mwh": 1817222.778
    },
    "2021": {
     "electricity_consumption_mwh": 1812714.164
    },
    "2022": {
     "electricity_consumption_mwh": 1742975.835
    },
    "2023": {
     "electricity_consumption_mwh": 1740820.142
    },
    "2024": {
     "electricity_consumption_mwh": 1729274.043
    }
   }
  },
  "hampshire-solent": {
   "name": "Hampshire and the Solent",
   "generation": {
    "2014": {
     "total_mwh": 385639.062,
     "by_technology_mwh": {
      "Solar": 223204.421,
      "Wind": 3385.869,
      "Hydro": 37.891,
      "Bioenergy & waste": 159010.881,
      "Other": 0.001
     }
    },
    "2015": {
     "total_mwh": 663603.822,
     "by_technology_mwh": {
      "Solar": 336014.493,
      "Wind": 3013.403,
      "Hydro": 41.834,
      "Bioenergy & waste": 324534.09,
      "Other": 0.003
     }
    },
    "2016": {
     "total_mwh": 639373.277,
     "by_technology_mwh": {
      "Solar": 496036.599,
      "Wind": 174.333,
      "Hydro": 86.361,
      "Bioenergy & waste": 143075.983,
      "Other": 0.002
     }
    },
    "2017": {
     "total_mwh": 672482.034,
     "by_technology_mwh": {
      "Solar": 532016.554,
      "Wind": 194.855,
      "Hydro": 118.568,
      "Bioenergy & waste": 140152.056,
      "Other": 0.002
     }
    },
    "2018": {
     "total_mwh": 747954.461,
     "by_technology_mwh": {
      "Solar": 593471.222,
      "Wind": 1969.338,
      "Hydro": 125.598,
      "Bioenergy & waste": 152388.302,
      "Other": 0.002
     }
    },
    "2019": {
     "total_mwh": 656305.727,
     "by_technology_mwh": {
      "Solar": 587182.299,
      "Wind": 65.21,
      "Hydro": 135.116,
      "Bioenergy & waste": 68923.103,
      "Other": 0.0
     }
    },
    "2020": {
     "total_mwh": 668274.993,
     "by_technology_mwh": {
      "Solar": 600129.134,
      "Wind": 77.229,
      "Hydro": 147.128,
      "Bioenergy & waste": 67921.504,
      "Other": 0.0
     }
    },
    "2021": {
     "total_mwh": 625932.778,
     "by_technology_mwh": {
      "Solar": 556067.591,
      "Wind": 58.865,
      "Hydro": 118.791,
      "Bioenergy & waste": 69687.534,
      "Other": 0.0
     }
    },
    "2022": {
     "total_mwh": 686697.53,
     "by_technology_mwh": {
      "Solar": 620452.097,
      "Wind": 45.139,
      "Hydro": 85.245,
      "Bioenergy & waste": 66115.049,
      "Other": 0.0
     }
    },
    "2023": {
     "total_mwh": 692970.008,
     "by_technology_mwh": {
      "Solar": 620829.33,
      "Wind": 48.566,
      "Hydro": 111.35,
      "Bioenergy & waste": 71980.762,
      "Other": 0.0
     }
    },
    "2024": {
     "total_mwh": 693115.841,
     "by_technology_mwh": {
      "Solar": 624294.48,
      "Wind": 47.253,
      "Hydro": 134.296,
      "Bioenergy & waste": 68639.812,
      "Other": 0.0
     }
    }
   },
   "consumption": {
    "2005": {
     "electricity_consumption_mwh": 9255223.78
    },
    "2006": {
     "electricity_consumption_mwh": 9052024.42
    },
    "2007": {
     "electricity_consumption_mwh": 8762530.46
    },
    "2008": {
     "electricity_consumption_mwh": 8833985.18
    },
    "2009": {
     "electricity_consumption_mwh": 8626635.268
    },
    "2010": {
     "electricity_consumption_mwh": 8574891.22
    },
    "2011": {
     "electricity_consumption_mwh": 8389843.626
    },
    "2012": {
     "electricity_consumption_mwh": 8340590.338
    },
    "2013": {
     "electricity_consumption_mwh": 8232940.728
    },
    "2014": {
     "electricity_consumption_mwh": 8300756.745
    },
    "2015": {
     "electricity_consumption_mwh": 8183262.97
    },
    "2016": {
     "electricity_consumption_mwh": 7930891.357
    },
    "2017": {
     "electricity_consumption_mwh": 7966638.489
    },
    "2018": {
     "electricity_consumption_mwh": 7968113.373
    },
    "2019": {
     "electricity_consumption_mwh": 7829549.988
    },
    "2020": {
     "electricity_consumption_mwh": 7448746.857
    },
    "2021": {
     "electricity_consumption_mwh": 7408406.509
    },
    "2022": {
     "electricity_consumption_mwh": 7106704.803
    },
    "2023": {
     "electricity_consumption_mwh": 7096526.398
    },
    "2024": {
     "electricity_consumption_mwh": 7088445.74
    }
   }
  }
 }
};
