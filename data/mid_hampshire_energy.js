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
  "fuel_categories": [
   "Coal",
   "Manufactured fuels",
   "Petroleum",
   "Gas",
   "Electricity",
   "Bioenergy and wastes"
  ],
  "units_consumption": "ktoe (kilotonnes of oil equivalent), except electricity_consumption_mwh which is MWh",
  "note_boundary": "Same Mid-Hampshire / Hampshire and the Solent constituent local authorities and Mid-Hampshire population-based retained fractions as mid_hampshire_emissions.json \u2014 see that file's note_boundary for the full explanation.",
  "note_suppression": "DESNZ suppresses some small per-technology generation cells (marked \"[X]\" in the source workbook) to avoid revealing individual plants' output. This site treats suppressed cells as 0 for their own technology group and adds the (small) gap between the visible columns and DESNZ's own published Total into the \"Other\" group, so technology totals always sum exactly to DESNZ's published local authority total. The consumption-by-fuel dataset has no equivalent suppression.",
  "note_ktoe_conversion": "Energy consumption is published in ktoe (kilotonnes of oil equivalent); electricity_consumption_mwh converts the Electricity fuel category to MWh using the standard DUKES/IEA factor of 1 toe = 11.63 MWh, for comparison against renewable generation (also in MWh). The consumption-by-fuel chart displays all fuels in ktoe, DESNZ's native unit.",
  "generated": "2026-08-05"
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
     "electricity_consumption_mwh": 651547.49,
     "fuels_ktoe": {
      "Coal": 1.745,
      "Manufactured fuels": 0.7128,
      "Petroleum": 185.5045,
      "Gas": 95.329,
      "Electricity": 56.023,
      "Bioenergy and wastes": 2.4864
     },
     "all_fuels_ktoe": 341.8007
    },
    "2006": {
     "electricity_consumption_mwh": 641894.59,
     "fuels_ktoe": {
      "Coal": 1.6359,
      "Manufactured fuels": 0.6935,
      "Petroleum": 186.7756,
      "Gas": 82.43,
      "Electricity": 55.193,
      "Bioenergy and wastes": 3.3978
     },
     "all_fuels_ktoe": 330.1257
    },
    "2007": {
     "electricity_consumption_mwh": 640824.63,
     "fuels_ktoe": {
      "Coal": 1.5109,
      "Manufactured fuels": 0.6366,
      "Petroleum": 187.5387,
      "Gas": 79.754,
      "Electricity": 55.101,
      "Bioenergy and wastes": 3.4966
     },
     "all_fuels_ktoe": 328.0379
    },
    "2008": {
     "electricity_consumption_mwh": 652722.12,
     "fuels_ktoe": {
      "Coal": 1.8439,
      "Manufactured fuels": 0.6985,
      "Petroleum": 183.9588,
      "Gas": 76.512,
      "Electricity": 56.124,
      "Bioenergy and wastes": 5.3781
     },
     "all_fuels_ktoe": 324.5163
    },
    "2009": {
     "electricity_consumption_mwh": 658831.527,
     "fuels_ktoe": {
      "Coal": 2.2043,
      "Manufactured fuels": 0.4566,
      "Petroleum": 177.6774,
      "Gas": 71.2234,
      "Electricity": 56.6493,
      "Bioenergy and wastes": 5.8797
     },
     "all_fuels_ktoe": 314.0898
    },
    "2010": {
     "electricity_consumption_mwh": 664138.429,
     "fuels_ktoe": {
      "Coal": 2.3681,
      "Manufactured fuels": 0.5658,
      "Petroleum": 177.5251,
      "Gas": 70.7993,
      "Electricity": 57.1056,
      "Bioenergy and wastes": 6.7998
     },
     "all_fuels_ktoe": 315.1638
    },
    "2011": {
     "electricity_consumption_mwh": 649373.109,
     "fuels_ktoe": {
      "Coal": 2.2377,
      "Manufactured fuels": 0.4743,
      "Petroleum": 173.08,
      "Gas": 67.0273,
      "Electricity": 55.836,
      "Bioenergy and wastes": 6.584
     },
     "all_fuels_ktoe": 305.2394
    },
    "2012": {
     "electricity_consumption_mwh": 647393.754,
     "fuels_ktoe": {
      "Coal": 2.4008,
      "Manufactured fuels": 0.5834,
      "Petroleum": 173.0164,
      "Gas": 68.2351,
      "Electricity": 55.6658,
      "Bioenergy and wastes": 6.2649
     },
     "all_fuels_ktoe": 306.1666
    },
    "2013": {
     "electricity_consumption_mwh": 640020.452,
     "fuels_ktoe": {
      "Coal": 2.7353,
      "Manufactured fuels": 0.7433,
      "Petroleum": 173.2584,
      "Gas": 67.0188,
      "Electricity": 55.0319,
      "Bioenergy and wastes": 6.9488
     },
     "all_fuels_ktoe": 305.7365
    },
    "2014": {
     "electricity_consumption_mwh": 635927.909,
     "fuels_ktoe": {
      "Coal": 2.373,
      "Manufactured fuels": 0.5701,
      "Petroleum": 174.2954,
      "Gas": 68.617,
      "Electricity": 54.68,
      "Bioenergy and wastes": 7.8584
     },
     "all_fuels_ktoe": 308.3938
    },
    "2015": {
     "electricity_consumption_mwh": 617440.43,
     "fuels_ktoe": {
      "Coal": 1.9261,
      "Manufactured fuels": 0.5058,
      "Petroleum": 180.6444,
      "Gas": 66.2205,
      "Electricity": 53.0903,
      "Bioenergy and wastes": 7.1993
     },
     "all_fuels_ktoe": 309.5866
    },
    "2016": {
     "electricity_consumption_mwh": 593976.624,
     "fuels_ktoe": {
      "Coal": 1.8107,
      "Manufactured fuels": 0.4974,
      "Petroleum": 181.3128,
      "Gas": 66.3642,
      "Electricity": 51.0728,
      "Bioenergy and wastes": 8.0089
     },
     "all_fuels_ktoe": 309.0668
    },
    "2017": {
     "electricity_consumption_mwh": 597938.538,
     "fuels_ktoe": {
      "Coal": 1.4893,
      "Manufactured fuels": 0.5374,
      "Petroleum": 183.0728,
      "Gas": 67.1314,
      "Electricity": 51.4135,
      "Bioenergy and wastes": 8.1413
     },
     "all_fuels_ktoe": 311.7857
    },
    "2018": {
     "electricity_consumption_mwh": 595206.726,
     "fuels_ktoe": {
      "Coal": 1.3786,
      "Manufactured fuels": 0.5457,
      "Petroleum": 180.1911,
      "Gas": 70.4859,
      "Electricity": 51.1786,
      "Bioenergy and wastes": 10.2439
     },
     "all_fuels_ktoe": 314.0238
    },
    "2019": {
     "electricity_consumption_mwh": 584146.301,
     "fuels_ktoe": {
      "Coal": 1.1933,
      "Manufactured fuels": 0.5324,
      "Petroleum": 176.973,
      "Gas": 67.2132,
      "Electricity": 50.2275,
      "Bioenergy and wastes": 11.8216
     },
     "all_fuels_ktoe": 307.961
    },
    "2020": {
     "electricity_consumption_mwh": 555838.562,
     "fuels_ktoe": {
      "Coal": 1.1273,
      "Manufactured fuels": 0.4858,
      "Petroleum": 143.4394,
      "Gas": 69.0996,
      "Electricity": 47.7935,
      "Bioenergy and wastes": 11.474
     },
     "all_fuels_ktoe": 273.4196
    },
    "2021": {
     "electricity_consumption_mwh": 559596.313,
     "fuels_ktoe": {
      "Coal": 1.1908,
      "Manufactured fuels": 0.4651,
      "Petroleum": 158.2219,
      "Gas": 66.8959,
      "Electricity": 48.1166,
      "Bioenergy and wastes": 11.1607
     },
     "all_fuels_ktoe": 286.051
    },
    "2022": {
     "electricity_consumption_mwh": 549481.201,
     "fuels_ktoe": {
      "Coal": 1.1142,
      "Manufactured fuels": 0.5441,
      "Petroleum": 160.1341,
      "Gas": 61.5186,
      "Electricity": 47.2469,
      "Bioenergy and wastes": 13.4547
     },
     "all_fuels_ktoe": 284.0125
    },
    "2023": {
     "electricity_consumption_mwh": 555606.75,
     "fuels_ktoe": {
      "Coal": 0.8045,
      "Manufactured fuels": 0.5342,
      "Petroleum": 160.1911,
      "Gas": 61.9409,
      "Electricity": 47.7736,
      "Bioenergy and wastes": 14.5804
     },
     "all_fuels_ktoe": 285.8247
    },
    "2024": {
     "electricity_consumption_mwh": 560248.718,
     "fuels_ktoe": {
      "Coal": 0.2944,
      "Manufactured fuels": 0.5585,
      "Petroleum": 164.7135,
      "Gas": 63.9255,
      "Electricity": 48.1727,
      "Bioenergy and wastes": 13.2009
     },
     "all_fuels_ktoe": 290.8654
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
     "electricity_consumption_mwh": 2095489.603,
     "fuels_ktoe": {
      "Coal": 7.5799,
      "Manufactured fuels": 128.3163,
      "Petroleum": 1306.4716,
      "Gas": 323.7354,
      "Electricity": 180.1797,
      "Bioenergy and wastes": 8.5442
     },
     "all_fuels_ktoe": 1954.827
    },
    "2006": {
     "electricity_consumption_mwh": 2041739.948,
     "fuels_ktoe": {
      "Coal": 7.1037,
      "Manufactured fuels": 121.1903,
      "Petroleum": 1220.2816,
      "Gas": 296.3962,
      "Electricity": 175.558,
      "Bioenergy and wastes": 11.0997
     },
     "all_fuels_ktoe": 1831.629
    },
    "2007": {
     "electricity_consumption_mwh": 2018206.514,
     "fuels_ktoe": {
      "Coal": 6.9735,
      "Manufactured fuels": 127.1093,
      "Petroleum": 1204.6396,
      "Gas": 286.4799,
      "Electricity": 173.5345,
      "Bioenergy and wastes": 11.6592
     },
     "all_fuels_ktoe": 1810.3952
    },
    "2008": {
     "electricity_consumption_mwh": 2021237.61,
     "fuels_ktoe": {
      "Coal": 7.7243,
      "Manufactured fuels": 134.3063,
      "Petroleum": 1076.7582,
      "Gas": 271.2702,
      "Electricity": 173.7952,
      "Bioenergy and wastes": 16.82
     },
     "all_fuels_ktoe": 1680.6728
    },
    "2009": {
     "electricity_consumption_mwh": 2012985.608,
     "fuels_ktoe": {
      "Coal": 8.4379,
      "Manufactured fuels": 122.5006,
      "Petroleum": 1170.992,
      "Gas": 250.4369,
      "Electricity": 173.0856,
      "Bioenergy and wastes": 18.5799
     },
     "all_fuels_ktoe": 1744.0316
    },
    "2010": {
     "electricity_consumption_mwh": 2014748.504,
     "fuels_ktoe": {
      "Coal": 9.1068,
      "Manufactured fuels": 128.2742,
      "Petroleum": 1144.7666,
      "Gas": 249.5563,
      "Electricity": 173.2372,
      "Bioenergy and wastes": 21.733
     },
     "all_fuels_ktoe": 1726.6741
    },
    "2011": {
     "electricity_consumption_mwh": 1991237.648,
     "fuels_ktoe": {
      "Coal": 9.081,
      "Manufactured fuels": 190.6685,
      "Petroleum": 1022.673,
      "Gas": 237.2705,
      "Electricity": 171.2156,
      "Bioenergy and wastes": 20.8767
     },
     "all_fuels_ktoe": 1651.7853
    },
    "2012": {
     "electricity_consumption_mwh": 1994808.373,
     "fuels_ktoe": {
      "Coal": 8.9053,
      "Manufactured fuels": 157.6498,
      "Petroleum": 1024.4401,
      "Gas": 239.7387,
      "Electricity": 171.5226,
      "Bioenergy and wastes": 20.4236
     },
     "all_fuels_ktoe": 1622.6801
    },
    "2013": {
     "electricity_consumption_mwh": 1984468.426,
     "fuels_ktoe": {
      "Coal": 9.3815,
      "Manufactured fuels": 138.5249,
      "Petroleum": 1087.781,
      "Gas": 237.9391,
      "Electricity": 170.6336,
      "Bioenergy and wastes": 22.621
     },
     "all_fuels_ktoe": 1666.881
    },
    "2014": {
     "electricity_consumption_mwh": 1995127.439,
     "fuels_ktoe": {
      "Coal": 8.0184,
      "Manufactured fuels": 134.0668,
      "Petroleum": 1058.2449,
      "Gas": 236.8621,
      "Electricity": 171.5501,
      "Bioenergy and wastes": 24.6712
     },
     "all_fuels_ktoe": 1633.4134
    },
    "2015": {
     "electricity_consumption_mwh": 1949730.509,
     "fuels_ktoe": {
      "Coal": 6.4096,
      "Manufactured fuels": 129.3097,
      "Petroleum": 1083.5196,
      "Gas": 232.5618,
      "Electricity": 167.6466,
      "Bioenergy and wastes": 22.8506
     },
     "all_fuels_ktoe": 1642.298
    },
    "2016": {
     "electricity_consumption_mwh": 1884209.483,
     "fuels_ktoe": {
      "Coal": 6.2169,
      "Manufactured fuels": 126.0334,
      "Petroleum": 1072.706,
      "Gas": 233.1407,
      "Electricity": 162.0129,
      "Bioenergy and wastes": 24.7339
     },
     "all_fuels_ktoe": 1624.8437
    },
    "2017": {
     "electricity_consumption_mwh": 1913845.892,
     "fuels_ktoe": {
      "Coal": 5.3465,
      "Manufactured fuels": 125.2394,
      "Petroleum": 1071.5729,
      "Gas": 232.4126,
      "Electricity": 164.5611,
      "Bioenergy and wastes": 25.3715
     },
     "all_fuels_ktoe": 1624.5041
    },
    "2018": {
     "electricity_consumption_mwh": 1904055.136,
     "fuels_ktoe": {
      "Coal": 5.3085,
      "Manufactured fuels": 100.9797,
      "Petroleum": 1077.4299,
      "Gas": 247.0134,
      "Electricity": 163.7193,
      "Bioenergy and wastes": 31.8546
     },
     "all_fuels_ktoe": 1626.3055
    },
    "2019": {
     "electricity_consumption_mwh": 1875684.049,
     "fuels_ktoe": {
      "Coal": 4.9048,
      "Manufactured fuels": 134.8133,
      "Petroleum": 1043.1131,
      "Gas": 240.2332,
      "Electricity": 161.2798,
      "Bioenergy and wastes": 37.7292
     },
     "all_fuels_ktoe": 1622.0733
    },
    "2020": {
     "electricity_consumption_mwh": 1817222.778,
     "fuels_ktoe": {
      "Coal": 4.6157,
      "Manufactured fuels": 113.4117,
      "Petroleum": 865.6487,
      "Gas": 244.6124,
      "Electricity": 156.253,
      "Bioenergy and wastes": 37.3275
     },
     "all_fuels_ktoe": 1421.869
    },
    "2021": {
     "electricity_consumption_mwh": 1812714.164,
     "fuels_ktoe": {
      "Coal": 4.9152,
      "Manufactured fuels": 112.1208,
      "Petroleum": 960.1782,
      "Gas": 236.0219,
      "Electricity": 155.8654,
      "Bioenergy and wastes": 37.8704
     },
     "all_fuels_ktoe": 1506.9718
    },
    "2022": {
     "electricity_consumption_mwh": 1742975.835,
     "fuels_ktoe": {
      "Coal": 4.5392,
      "Manufactured fuels": 119.1447,
      "Petroleum": 1024.8909,
      "Gas": 210.7164,
      "Electricity": 149.8689,
      "Bioenergy and wastes": 44.2313
     },
     "all_fuels_ktoe": 1553.3914
    },
    "2023": {
     "electricity_consumption_mwh": 1740820.142,
     "fuels_ktoe": {
      "Coal": 3.4105,
      "Manufactured fuels": 115.6259,
      "Petroleum": 1000.7179,
      "Gas": 208.2572,
      "Electricity": 149.6836,
      "Bioenergy and wastes": 48.079
     },
     "all_fuels_ktoe": 1525.7742
    },
    "2024": {
     "electricity_consumption_mwh": 1729274.043,
     "fuels_ktoe": {
      "Coal": 1.6122,
      "Manufactured fuels": 105.2795,
      "Petroleum": 1022.5214,
      "Gas": 208.6508,
      "Electricity": 148.6908,
      "Bioenergy and wastes": 45.3695
     },
     "all_fuels_ktoe": 1532.1242
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
     "electricity_consumption_mwh": 9255223.78,
     "fuels_ktoe": {
      "Coal": 28.7977,
      "Manufactured fuels": 216.5456,
      "Petroleum": 2884.2466,
      "Gas": 1473.953,
      "Electricity": 795.806,
      "Bioenergy and wastes": 32.843
     },
     "all_fuels_ktoe": 5432.1919
    },
    "2006": {
     "electricity_consumption_mwh": 9052024.42,
     "fuels_ktoe": {
      "Coal": 26.2453,
      "Manufactured fuels": 204.8811,
      "Petroleum": 2753.7937,
      "Gas": 1377.012,
      "Electricity": 778.334,
      "Bioenergy and wastes": 41.8882
     },
     "all_fuels_ktoe": 5182.1514
    },
    "2007": {
     "electricity_consumption_mwh": 8762530.46,
     "fuels_ktoe": {
      "Coal": 26.0795,
      "Manufactured fuels": 214.0911,
      "Petroleum": 2720.2112,
      "Gas": 1344.987,
      "Electricity": 753.442,
      "Bioenergy and wastes": 40.084
     },
     "all_fuels_ktoe": 5098.8938
    },
    "2008": {
     "electricity_consumption_mwh": 8833985.18,
     "fuels_ktoe": {
      "Coal": 29.4561,
      "Manufactured fuels": 226.7778,
      "Petroleum": 2465.3388,
      "Gas": 1272.599,
      "Electricity": 759.586,
      "Bioenergy and wastes": 54.0588
     },
     "all_fuels_ktoe": 4807.8166
    },
    "2009": {
     "electricity_consumption_mwh": 8626635.268,
     "fuels_ktoe": {
      "Coal": 31.6935,
      "Manufactured fuels": 205.2785,
      "Petroleum": 2599.2986,
      "Gas": 1163.5425,
      "Electricity": 741.7571,
      "Bioenergy and wastes": 58.1061
     },
     "all_fuels_ktoe": 4799.6783
    },
    "2010": {
     "electricity_consumption_mwh": 8574891.22,
     "fuels_ktoe": {
      "Coal": 36.3893,
      "Manufactured fuels": 215.8305,
      "Petroleum": 2556.8335,
      "Gas": 1174.9549,
      "Electricity": 737.3079,
      "Bioenergy and wastes": 68.4846
     },
     "all_fuels_ktoe": 4789.8008
    },
    "2011": {
     "electricity_consumption_mwh": 8389843.626,
     "fuels_ktoe": {
      "Coal": 35.3197,
      "Manufactured fuels": 317.3115,
      "Petroleum": 2344.8047,
      "Gas": 1104.2815,
      "Electricity": 721.3967,
      "Bioenergy and wastes": 65.6128
     },
     "all_fuels_ktoe": 4588.7269
    },
    "2012": {
     "electricity_consumption_mwh": 8340590.338,
     "fuels_ktoe": {
      "Coal": 35.5248,
      "Manufactured fuels": 263.6725,
      "Petroleum": 2339.9199,
      "Gas": 1103.1744,
      "Electricity": 717.1617,
      "Bioenergy and wastes": 65.04
     },
     "all_fuels_ktoe": 4524.4932
    },
    "2013": {
     "electricity_consumption_mwh": 8232940.728,
     "fuels_ktoe": {
      "Coal": 39.96,
      "Manufactured fuels": 233.6753,
      "Petroleum": 2431.8016,
      "Gas": 1069.9061,
      "Electricity": 707.9055,
      "Bioenergy and wastes": 71.1049
     },
     "all_fuels_ktoe": 4554.3534
    },
    "2014": {
     "electricity_consumption_mwh": 8300756.745,
     "fuels_ktoe": {
      "Coal": 35.9748,
      "Manufactured fuels": 225.0332,
      "Petroleum": 2396.9115,
      "Gas": 1071.2992,
      "Electricity": 713.7366,
      "Bioenergy and wastes": 77.7637
     },
     "all_fuels_ktoe": 4520.7191
    },
    "2015": {
     "electricity_consumption_mwh": 8183262.97,
     "fuels_ktoe": {
      "Coal": 28.8226,
      "Manufactured fuels": 216.4989,
      "Petroleum": 2450.6657,
      "Gas": 1064.9601,
      "Electricity": 703.634,
      "Bioenergy and wastes": 72.9595
     },
     "all_fuels_ktoe": 4537.5407
    },
    "2016": {
     "electricity_consumption_mwh": 7930891.357,
     "fuels_ktoe": {
      "Coal": 28.4108,
      "Manufactured fuels": 211.0169,
      "Petroleum": 2430.7459,
      "Gas": 1057.8199,
      "Electricity": 681.9339,
      "Bioenergy and wastes": 80.0749
     },
     "all_fuels_ktoe": 4490.0023
    },
    "2017": {
     "electricity_consumption_mwh": 7966638.489,
     "fuels_ktoe": {
      "Coal": 25.1412,
      "Manufactured fuels": 210.1262,
      "Petroleum": 2418.7676,
      "Gas": 1059.8221,
      "Electricity": 685.0076,
      "Bioenergy and wastes": 82.684
     },
     "all_fuels_ktoe": 4481.5487
    },
    "2018": {
     "electricity_consumption_mwh": 7968113.373,
     "fuels_ktoe": {
      "Coal": 23.6048,
      "Manufactured fuels": 170.5181,
      "Petroleum": 2414.2117,
      "Gas": 1095.135,
      "Electricity": 685.1344,
      "Bioenergy and wastes": 103.8495
     },
     "all_fuels_ktoe": 4492.4534
    },
    "2019": {
     "electricity_consumption_mwh": 7829549.988,
     "fuels_ktoe": {
      "Coal": 19.5951,
      "Manufactured fuels": 225.8273,
      "Petroleum": 2345.3727,
      "Gas": 1086.2434,
      "Electricity": 673.2201,
      "Bioenergy and wastes": 119.5998
     },
     "all_fuels_ktoe": 4469.8585
    },
    "2020": {
     "electricity_consumption_mwh": 7448746.857,
     "fuels_ktoe": {
      "Coal": 18.142,
      "Manufactured fuels": 190.4108,
      "Petroleum": 1924.7956,
      "Gas": 1122.9407,
      "Electricity": 640.4769,
      "Bioenergy and wastes": 119.019
     },
     "all_fuels_ktoe": 4015.7851
    },
    "2021": {
     "electricity_consumption_mwh": 7408406.509,
     "fuels_ktoe": {
      "Coal": 17.7355,
      "Manufactured fuels": 188.0583,
      "Petroleum": 2115.6197,
      "Gas": 1078.0027,
      "Electricity": 637.0083,
      "Bioenergy and wastes": 118.4327
     },
     "all_fuels_ktoe": 4154.8573
    },
    "2022": {
     "electricity_consumption_mwh": 7106704.803,
     "fuels_ktoe": {
      "Coal": 15.9442,
      "Manufactured fuels": 200.3505,
      "Petroleum": 2231.5559,
      "Gas": 956.2989,
      "Electricity": 611.0666,
      "Bioenergy and wastes": 135.1351
     },
     "all_fuels_ktoe": 4150.3512
    },
    "2023": {
     "electricity_consumption_mwh": 7096526.398,
     "fuels_ktoe": {
      "Coal": 11.3781,
      "Manufactured fuels": 194.3292,
      "Petroleum": 2187.1653,
      "Gas": 942.2636,
      "Electricity": 610.1914,
      "Bioenergy and wastes": 147.5097
     },
     "all_fuels_ktoe": 4092.8373
    },
    "2024": {
     "electricity_consumption_mwh": 7088445.74,
     "fuels_ktoe": {
      "Coal": 5.2528,
      "Manufactured fuels": 177.3518,
      "Petroleum": 2218.9442,
      "Gas": 931.3591,
      "Electricity": 609.4966,
      "Bioenergy and wastes": 145.9048
     },
     "all_fuels_ktoe": 4088.3093
    }
   }
  }
 }
};
