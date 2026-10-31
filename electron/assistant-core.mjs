const string={type:'string'},ids={type:'array',items:{type:'integer'},maxItems:100};
const definition=(name,description,properties={},required=[])=>({name,description,parameters:{type:'object',properties,required,additionalProperties:false}});
export const definitions=[
 definition('search_companies','Search the local YC snapshot. Topic/region/batch/status are exact filters; query is keyword search, all words required. Use separate searches for alternate terms. Returns counts, pagination and company references.',{query:string,topic:string,region:string,batch:string,status:string,year:string,offset:{type:'integer'},limit:{type:'integer'}}),
 definition('get_company','Read full snapshot details of a company.',{id:{type:'integer'}},['id']),
 definition('find_similar_companies','Find description neighbors from the existing local semantic map. Inspect returned companies before recommending them.',{id:{type:'integer'},limit:{type:'integer'}},['id']),
 definition('get_catalog','List available topics, regions, batches and statuses to use in searches.'),
 definition('get_interests','Read user interests, liked companies and saved folders. Notes only when separately enabled.'),
 definition('get_saved_companies','Read a page of saved companies, optionally from a folder. Notes are returned only when enabled.',{folder_id:string,offset:{type:'integer'},limit:{type:'integer'}}),
 definition('list_folders','List folders and saved company IDs.'),
 definition('show_company','Open a company selected and centered in Explore. Only when the user asks to navigate.',{id:{type:'integer'}},['id']),
 definition('create_folder','Create a saved folder, only when requested by the user. Returns existing folder if same name exists.',{name:string},['name']),
 definition('save_companies','Save companies to a folder. Existing saves keep their current folder unless move_existing=true. Only when user requests saving/moving.',{company_ids:ids,folder_id:string,move_existing:{type:'boolean'}},['company_ids','folder_id'])
];
export function allowedTools(cap={}){return definitions.filter(t=>t.name==='list_folders'?(cap.library||cap.organize):['get_interests','get_saved_companies'].includes(t.name)?cap.library:['create_folder','save_companies'].includes(t.name)?cap.organize:t.name==='show_company'?cap.navigate:cap.search);}
