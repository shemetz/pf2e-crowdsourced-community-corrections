import csv
import json

HEADERS_LONG_TO_SHORT = {
    'Sorting/grouping': "sorting_grouping",
    'Source': "source",
    'Name/Header (+AoN link)': 'name_or_header',
    'Subheader (if any)': 'subheader',
    'Issue type': 'issue_type',
    'Confidence': 'confidence',
    'Severity': 'severity',
    'Issue description/summary': 'issue_description',
    'Reasoning/arguments/proof': 'reasoning',
    'Proposed fix (unofficial!)': 'proposed_fix',
    'Fix reliability': 'fix_reliability',
    'Fix commentary': 'fix_commentary',
    'Discussion link': 'discussion_link',
    'Additional comments': 'additional_comments',
    '_module_uuid': 'module_uuid',
    '_module_action': 'module_action',
    '_module_field_key': 'module_field_key',
    '_module_pattern': 'module_pattern',
    '_module_value': 'module_value',
    '_module_comment': 'module_comment',
}


def main():
    print("importing spreadsheet data...")
    csv_file_path = "./PF2E Crowdsourced Community Corrections - Errors.csv"
    with open(csv_file_path, newline='') as csv_file:
        file_reader = csv.reader(csv_file, delimiter=',', quotechar='"')
        csv_lines = list(file_reader)
    # first line is headers
    headers = csv_lines[0]
    assert tuple(headers) == tuple(HEADERS_LONG_TO_SHORT.keys())
    # we want to convert the csv file into a json file, which is weird but convenient enough
    # we'll also convert the headers to shorter versions, then use them as json object keys
    # this is a bit hacky but it works
    created_json_list = []
    csv_corrections = csv_lines[1:]
    prev_obj = None
    for corr in csv_corrections:
        json_obj = {}
        for header, value in zip(headers, corr):
            header: str = HEADERS_LONG_TO_SHORT[header]
            if "\u00e2\u2020\u2018 see above" in value and prev_obj is not None:
                value = prev_obj[header]
            if header in ['confidence', 'severity', 'fix_reliability']:
                value = int(value)
            else:
                value = value.replace("\r\n", "\n")
                value = value.replace("\n\n", "\n")
                value = value.replace("<hr>", "<hr />")
            json_obj[header] = value
        if json_obj['module_action'] in ['', 'GOOD_ALREADY', 'SKIP']:
            continue  # skip this correction
        created_json_list.append(json_obj)
        prev_obj = json_obj
    created_json_list.sort(key=lambda x: x['name_or_header'])
    created_json_list.sort(key=lambda x: x['sorting_grouping'])
    created_json_list.sort(key=lambda x: x['fix_reliability'], reverse=True)
    created_json_list.sort(key=lambda x: x['confidence'], reverse=True)
    print(f"Saving... ({len(created_json_list)} corrections)")
    js_file_path = "../scripts/generatedCorrections.js"
    with open(js_file_path, 'w') as js_file:
        js_file.write("export const allGeneratedCorrections = ")
        js_file.write(json.dumps(created_json_list, indent=2))
    print("Done!")


if __name__ == '__main__':
    main()
