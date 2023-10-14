function mainSearchLogic(manageable_field, search_body, sort_decision, is_authorize_ip_address, search_type) {

    let search_tab;
    let search = search_body.search; // search value
    let final_sorting_field = sort_decision.sorting_field;
    let final_sorting_type = sort_decision.sorting_type;

    // Step 1: Initialize body structure
    let bbody;
    // result_search body
    if (search_type === 'result_search') {
        bbody = {
            from: 0,
            size: search_body.current_page_size,
            track_total_hits: true,
            sort: [
                {
                    [final_sorting_field]: final_sorting_type
                },
                {
                    _script: {
                        type: "number",
                        script: {
                            lang: "painless",
                            source: "doc.containsKey('image_path') && doc['image_path'].size() > 0 ? 0 : 1"
                        },
                    }
                },
                "_score"
            ],
            query: {
                function_score: {
                    query: {
                        bool: {
                            must: [],
                            should: [],
                        },
                    },
                    functions: [
                        {
                            random_score: {
                            },
                            weight: 1
                        }
                    ],
                    score_mode: "sum"
                }
            }
        };
        search_tab = search_body.current_tab;

    } else if (search_type === 'count_search') {
        bbody = {
            from: 0,
            size: 0,
            track_total_hits: true,
            sort: [
                {
                    [final_sorting_field]: final_sorting_type
                },
                {
                    _script: {
                        type: "number",
                        script: {
                            lang: "painless",
                            source: "doc.containsKey('image_path') && doc['image_path'].size() > 0 ? 0 : 1"
                        },
                    }
                },
                "_score"
            ],
            query: {
                function_score: {
                    query: {
                        bool: {
                            must: [],
                            should: [],
                        },
                    },
                    functions: [
                        {
                            random_score: {
                            },
                            weight: 1
                        }
                    ],
                    score_mode: "sum"
                }
            }
        };
        search_tab = manageable_field;

    } else if (search_type === 'distinct_search') {
        search_tab = search_body.current_tab;
        if (manageable_field === "items.collection.keyword" || manageable_field === "items.availability.keyword") { // nested distinct body
            bbody = {
                query: {
                    function_score: {
                        query: {
                            bool: {
                                must: [],
                                should: [],
                            },
                        },
                        functions: [
                            {
                                random_score: {
                                },
                                weight: 1
                            }
                        ],
                        score_mode: "sum"
                    }
                },
                aggs: {
                    distinct_item_values: {
                        nested: {
                            path: "items" // Specify the path to the "items" nested field
                        },
                        aggs: {
                            distinct_field_values: {
                                terms: {
                                    size: 10000,
                                    field: manageable_field, // Replace with the actual field within "items" you want to aggregate on
                                },
                            },
                        },
                    },
                },
            }
        } else {
            bbody = {
                query: {
                    function_score: {
                        query: {
                            bool: {
                                must: [],
                                should: [],
                            },
                        },
                        functions: [
                            {
                                random_score: {
                                },
                                weight: 1
                            }
                        ],
                        score_mode: "sum"
                    }
                },
                aggs: {
                    distinct_field_values: {
                        terms: {
                            size: 10000,
                            field: manageable_field, // Replace 'specific_field' with the actual field you want to aggregate on
                        },
                    },
                },
                track_total_hits: true, // to allow total hits value of more than 10000
            }
        }
    }

    // Step 2: Check is the search empty or not        
    let is_search_value_empty = true;
    if (search !== "") {
        is_search_value_empty = false; // to check that if the search box empty or not
    }

    // Step 3: Validate the type of the search, Can be arterisk search, normal search, quotation search
    let is_quotation_search;
    if (is_search_value_empty === false) { // if the search box is not empty then only do quotation checking
        is_quotation_search = this.isQuotationSearch(search); // to check that the search is quotation "" boolean type or not
    }

    // Step 4: Structure query body
    //      -----> Case 1: When search_tab is not ALL and the search is empty
    if (search_tab !== 'ALL' && is_search_value_empty === true) {
        bbody.query.function_score.query.bool.must.push(
            {
                match_phrase: {
                    category_code: search_tab, // ART/ARC/LIB
                },
            },
        )

        bbody.query.function_score.query.bool.must.push(
            {
                match_all: {} // match_all = take all result
            },
        );
    }

    //      -----> Case 2: When search_tab is not ALL and the search is not empty
    else if (search_tab !== 'ALL' && is_search_value_empty === false) {
        bbody.query.function_score.query.bool.must.push(
            {
                match_phrase: {
                    category_code: search_tab, // ART/ARC/LIB
                },
            },
        )
        if (is_quotation_search.is_quotation === false) { // if not quotation search then will use normal search
            let is_wildcard = this.isWildcardSearch(search); // to check that is that the search is wildcard * search or not
            if (!is_wildcard) { // if not wildcard asterisk * also will use normal multi_match serch
                bbody.query.function_score.query.bool.must.push(
                    {
                        match_phrase: {
                            category_code: search_tab, // ALL, ART, ARC, LIB - if ALL will not get result
                        },
                    },
                    {
                        multi_match: {
                            query: search, // Search Value
                            type: "best_fields", // Finds documents which match any field, but uses the _score from the best field.
                            fields: this.elasticsearch_index_fields_normal

                        },
                    },
                )
            } else { // else the search is not quotation search but is wildcard asterisk search then will 
                bbody.query.function_score.query.bool.must.push(
                    {
                        match_phrase: {
                            category_code: search_tab, // ALL, ART, ARC, LIB - if ALL will not get result
                        },
                    },
                    {
                        query_string: {
                            query: search,
                            fields: this.elasticsearch_index_fields_normal // not multi_match so need to specific the fields to search
                        },
                    },
                )
            }
        } else if (is_quotation_search.is_quotation === true && is_quotation_search.multiple_term === true) { // if quotation search and also multiple_term 
            // Example : "\"Chinese\" \"Temple\""
            let all_fields = this.elasticsearch_index_fields_normal;

            let should_clause = {
                bool: {
                    should: []
                }
            }

            for (let fields_category of all_fields) {
                let match_clause = {
                    bool: {
                        must: [] // must means AND CASE 
                    }
                }

                if (is_quotation_search.is_multiple_term) {
                    for (let item of is_quotation_search.array_with_asterisks) { // array_with_asterisk = "*Chinese*" "*Temple*" <-- isQuotationSearch()
                        let search_query = {
                            query_string: {
                                query: item, // "*Chinese*"
                                fields: [fields_category] // not multi_match so need to specific the fields to search
                            }
                        };
                        match_clause.bool.must.push(search_query);
                    }
                    should_clause.bool.should.push(match_clause);
                } else {
                    let search_query = {
                        query_string: {
                            query: is_quotation_search.array_with_asterisks, // "*Chinese*"
                            fields: [fields_category] // not multi_match so need to specific the fields to search
                        }
                    };
                    should_clause.bool.should.push(search_query);
                }
            }
            bbody.query.function_score.query.bool.must.push(should_clause);

        } else if (is_quotation_search.is_quotation === true && is_quotation_search.multiple_term === false) { // if is quotation search and one term only
            // "\" Chinese Temple"\"

            let fields = this.elasticsearch_index_fields_wildcard

            // if use wildcard need to use add in .keyword in the field

            let should_body = {
                bool: {
                    should: [] // should means OR CASE
                }
            }
            for (let item of fields) {
                if (item === "product_title.keyword") {
                    should_body.bool.should.push(
                        {
                            wildcard: {
                                [item]: {
                                    value: is_quotation_search.array_with_asterisks,
                                    boost: 5,
                                    case_insensitive: true

                                } // "*Chinese Temple*"
                            }
                        }
                    )
                } else {
                    let is_commas = is_quotation_search.array_with_asterisks.includes(',');
                    if (item === 'subject.keyword') {
                        let input_string;
                        if (is_commas) {
                            input_string = is_quotation_search.array_with_asterisks.replace(/,/, '*');
                        } else {
                            input_string = is_quotation_search.array_with_asterisks.replace(/\s/, '* ');
                        }

                        should_body.bool.should.push(
                            {
                                wildcard: {
                                    [item]: {
                                        value: input_string,
                                        case_insensitive: true
                                    }
                                }
                            }
                        )
                    } else {
                        should_body.bool.should.push(
                            {
                                wildcard: {
                                    [item]: {
                                        value: is_quotation_search.array_with_asterisks,
                                        case_insensitive: true
                                    }
                                }
                            }
                        )
                    }
                }
            }

            bbody.query.function_score.query.bool.must.push(should_body);
            bbody.query.function_score.query.bool.must.push({
                match: {
                    category_code: search_tab // ALL, ARC, ART, LIB
                }
            });
        }
    }

    //      -----> Case 3: When search_tab is ALL and the search is not empty
    else if (search_tab === 'ALL' && is_search_value_empty === false) {

        if (is_quotation_search.is_quotation === false) { // if not quotation search then will use normal search
            let is_wildcard = this.isWildcardSearch(search); // to check that is that the search is wildcard * search or not
            if (!is_wildcard) { // if not wildcard asterisk * also will use normal multi_match serch
                bbody.query.function_score.query.bool.must.push(
                    {
                        multi_match: {
                            query: search, // Search Value
                            type: "best_fields", // Finds documents which match any field, but uses the _score from the best field.
                            fields: this.elasticsearch_index_fields_normal

                        },
                    },
                    {
                        match_phrase: {
                            category_code: search_tab, // ART/ARC/LIB
                        },
                    }
                )
            } else { // else the search is not quotation search but is wildcard asterisk search then will 
                bbody.query.function_score.query.bool.must.push(
                    {
                        query_string: {
                            query: search,
                            fields: this.elasticsearch_index_fields_normal
                        },
                    },
                    {
                        match_phrase: {
                            category_code: search_tab, // ART/ARC/LIB
                        },
                    }
                )
            }
        } else if (is_quotation_search.is_quotation === true && is_quotation_search.multiple_term === true) { // if quotation search and also multiple_term 
            // Example : "\"Chinese\" \"Temple\""
            let all_fields = this.elasticsearch_index_fields_normal;

            let should_clause = {
                bool: {
                    should: []
                }
            }

            for (let fields_category of all_fields) {
                let match_clause = {
                    bool: {
                        must: [] // must means AND CASE 
                    }
                }

                if (is_quotation_search.is_multiple_term) {
                    for (let item of is_quotation_search.array_with_asterisks) { // array_with_asterisk = "*Chinese*" "*Temple*" <-- isQuotationSearch()
                        let search_query = {
                            query_string: {
                                query: item, // "*Chinese*"
                                fields: [fields_category] // not multi_match so need to specific the fields to search
                            }
                        };
                        match_clause.bool.must.push(search_query);
                    }
                    should_clause.bool.should.push(match_clause);
                    bbody.query.function_score.query.bool.must.push(should_clause);
                } else {
                    let search_query = {
                        query_string: {
                            query: is_quotation_search.array_with_asterisks, // "*Chinese*"
                            fields: [fields_category] // not multi_match so need to specific the fields to search
                        }
                    };
                    should_clause.bool.should.push(search_query);
                }
            }

            if (!is_quotation_search.is_multiple_term) {
                bbody.query.function_score.query.bool.must.push(should_clause);
            }

        } else if (is_quotation_search.is_quotation === true && is_quotation_search.multiple_term === false) { // if is quotation search and one term only
            // Example data "\" Chinese Temple"\" <-- one term not multiple term
            let fields = this.elasticsearch_index_fields_wildcard;

            let should_body = {
                bool: {
                    should: []
                }
            }

            for (let item of fields) {
                if (item === "product_title.keyword") {
                    should_body.bool.should.push(
                        {
                            wildcard: {
                                [item]: {
                                    value: is_quotation_search.array_with_asterisks,
                                    boost: 5,
                                    case_insensitive: true

                                } // "*Chinese Temple*"
                            }
                        }
                    )
                } else {
                    let is_commas = is_quotation_search.array_with_asterisks.includes(',');
                    if (item === 'subject.keyword') {
                        let input_string;
                        if (is_commas) {
                            input_string = is_quotation_search.array_with_asterisks.replace(/,/, '*');
                        } else {
                            input_string = is_quotation_search.array_with_asterisks.replace(/\s/, '* ');
                        }

                        should_body.bool.should.push(
                            {
                                wildcard: {
                                    [item]: {
                                        value: input_string,
                                        case_insensitive: true
                                    }
                                }
                            }
                        )
                    } else {
                        should_body.bool.should.push(
                            {
                                wildcard: {
                                    [item]: {
                                        value: is_quotation_search.array_with_asterisks,
                                        case_insensitive: true
                                    }
                                }
                            }
                        )
                    }
                }
            }

            bbody.query.function_score.query.bool.must.push(should_body);
            // bbody.query.function_score.query.bool.must.push({ wildcard: { "product_title.keyword": is_quotation_search.array_with_asterisks } });
        }
    }

    //      -----> Case 4: When search_tab is ALL and the search is empty
    else if (search_tab === 'ALL' && is_search_value_empty === true) {
        bbody.query.function_score.query.bool.must.push(
            {
                match: {
                    is_available: true,
                },
            },
            {
                /* match_phrase: {
                    category_code: current_category
                } */

                match_all: {}
            }
        );

    }

    // Step 5: the result mist be is_available = true
    bbody.query.function_score.query.bool.must.push(
        {
            match: {
                is_available: true,
            },
        },
    )

    // Step 6: If not finding distinct value
    if (search_type !== 'distinct_search') {
        // Step 6.1: Must not: Displayed Record 

        if (search_type !== 'count_search') {
            const displayed_record = {
                bool: {
                    must_not: { // must_not will avoid the duplication of the data and will skip the data with the id
                        terms: {
                            id: search_body.displayed_result
                        }
                    }
                }
            }
            bbody.query.function_score.query.bool.must.push(displayed_record);
        }

        // Step 6.2: Apply Filter
        let search_params
        if (search_tab === 'ART') {
            search_params = search_body.artwork
        } else if (search_tab === 'ARC') {
            search_params = search_body.archive

        } else if (search_tab === 'LIB') {
            search_params = search_body.library
        }

        if (search_params) {
            this.filter_main(bbody, search_params, search_tab, 'search_filter')
        }
    }

    // return bbody;

    // Step 8: Search Result with Elastic Search
    let response; // Declare a variable to store the Elasticsearch response
    response = this.client.search({ // elastic search
        index: process.env.ELASTIC_SEARCH_INDEX, // in .env file
        body: bbody
    })


    if (search_type === 'result_search') {
        const { body } = response; // Extract the body from the Elasticsearch response
        let display_image_boolean = true;
        // Extract the data from the Elasticsearch response
        let consolidated_data = body.hits.hits.map(hit => hit._source);
        if ((!is_authorize_ip_address && search_tab === 'ARC') || (search_tab === 'ART') || (search_tab === 'ALL')) {
            display_image_boolean = false;
            consolidated_data = this.removeImagePath(is_authorize_ip_address, consolidated_data, search_tab);
        }

        return consolidated_data;

    } else if (search_type === 'count_search') {
        let result_count = response.body.hits.total.value

        return result_count;

    } else if (search_type === 'distinct_search') {
        let uniqueValues;
        if (manageable_field === "items.collection.keyword" || manageable_field === "items.availability.keyword") { //  get nested distinct result
            uniqueValues = response.body.aggregations.distinct_item_values.distinct_field_values.buckets.map(
                (bucket) => bucket.key
            );
        } else {
            uniqueValues = response.body.aggregations.distinct_field_values.buckets.map(
                (bucket) => bucket.key
            );
        }
        return uniqueValues;
    }
}
